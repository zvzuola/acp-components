use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;

/// Wrapper to allow IPC commands to write to the agent's stdin.
struct AgentBridge {
    /// Sender side of a channel whose receiver thread writes to agent stdin.
    tx: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
    /// The child process handle, kept for cleanup.
    child: Mutex<Option<Child>>,
}

/// A running terminal process managed by the backend.
struct TerminalProcess {
    child: Arc<Mutex<Option<Child>>>,
    stdin_tx: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
}

struct AppState {
    agent: AgentBridge,
    terminals: Mutex<HashMap<String, TerminalProcess>>,
}

#[derive(Deserialize)]
struct StartAgentArgs {
    command: String,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Deserialize)]
struct CreateTerminalArgs {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    env: Option<Vec<EnvVar>>,
}

#[derive(Deserialize)]
struct EnvVar {
    name: String,
    value: String,
}

#[derive(Deserialize)]
struct TerminalIdArg {
    terminal_id: String,
}

#[derive(Deserialize)]
struct WriteToTerminalArgs {
    terminal_id: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct TerminalOutputPayload {
    terminal_id: String,
    output: String,
}

#[derive(Serialize, Clone)]
struct TerminalExitPayload {
    terminal_id: String,
    exit_code: Option<i32>,
    signal: Option<String>,
}

fn resolve_command(cmd: &str) -> String {
    if cfg!(target_os = "windows") && !cmd.ends_with(".exe") && !cmd.ends_with(".cmd") && !cmd.ends_with(".bat") {
        format!("{}.cmd", cmd)
    } else {
        cmd.to_string()
    }
}

static TERMINAL_COUNTER: AtomicU64 = AtomicU64::new(1);

fn next_terminal_id() -> String {
    format!("term_{}", TERMINAL_COUNTER.fetch_add(1, Ordering::Relaxed))
}

/// Spawn the agent subprocess and begin bridging its stdio to the frontend
/// via Tauri events. The frontend communicates with the agent through
/// `write_to_agent` (stdin) and listens to the `agent-output` event (stdout).
#[tauri::command]
fn start_agent(state: tauri::State<'_, AppState>, app: tauri::AppHandle, args: StartAgentArgs) -> Result<(), String> {
    // Guard against double-start
    {
        let tx = state.agent.tx.lock().map_err(|e| e.to_string())?;
        if tx.is_some() {
            return Err("Agent is already running".into());
        }
    }

    let resolved = resolve_command(&args.command);
    println!("Starting agent with command: {} {:?}", resolved, args.args);

    let mut child = Command::new(&resolved)
        .args(&args.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent '{}': {}", resolved, e))?;

    println!("Agent process started with PID: {}", child.id());

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    let stdin = child.stdin.take().ok_or("No stdin")?;

    // Channel: frontend writes -> this thread -> agent stdin
    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    // Thread that reads from the channel and writes to agent stdin
    std::thread::spawn(move || {
        let mut stdin = stdin;
        for data in rx {
            if stdin.write_all(&data).is_err() {
                break;
            }
            if stdin.flush().is_err() {
                break;
            }
        }
    });

    // Thread that reads agent stdout and emits to frontend
    let app_stdout = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stdout.emit("agent-output", data);
                }
                Err(_) => break,
            }
        }
    });

    // Thread that reads agent stderr and emits to frontend
    let app_stderr = app.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stderr.emit("agent-stderr", data);
                }
                Err(_) => break,
            }
        }
    });

    // Store channel sender and child handle for later use
    {
        let mut tx_guard = state.agent.tx.lock().map_err(|e| e.to_string())?;
        *tx_guard = Some(tx);
    }
    {
        let mut child_guard = state.agent.child.lock().map_err(|e| e.to_string())?;
        *child_guard = Some(child);
    }

    let _ = app.emit("agent-started", ());
    Ok(())
}

/// Write raw data to the agent's stdin. Called by the frontend transport.
#[tauri::command]
fn write_to_agent(state: tauri::State<'_, AppState>, data: Vec<u8>) -> Result<(), String> {
    let tx = state.agent.tx.lock().map_err(|e| e.to_string())?;
    match tx.as_ref() {
        Some(sender) => sender.send(data).map_err(|e| format!("Failed to write to agent: {}", e)),
        None => Err("Agent not started".into()),
    }
}

/// Kill the agent subprocess and clean up resources.
#[tauri::command]
fn kill_agent(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> Result<(), String> {
    // Drop the channel sender first so the stdin writer thread exits
    {
        let mut tx = state.agent.tx.lock().map_err(|e| e.to_string())?;
        *tx = None;
    }
    // Kill the child process
    {
        let mut child = state.agent.child.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut c) = *child {
            let _ = c.kill();
            let _ = c.wait();
        }
        *child = None;
    }
    let _ = app.emit("agent-closed", ());
    Ok(())
}

// ---------------------------------------------------------------------------
// Terminal commands
// ---------------------------------------------------------------------------

/// Create a terminal (spawn a child process) and begin piping its output to
/// `terminal-output` events and its exit to `terminal-exit` events.
#[tauri::command]
fn create_terminal(state: tauri::State<'_, AppState>, app: tauri::AppHandle, args: CreateTerminalArgs) -> Result<String, String> {
    let resolved = resolve_command(&args.command);
    let terminal_id = next_terminal_id();

    let mut cmd = Command::new(&resolved);
    cmd.args(&args.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref cwd) = args.cwd {
        cmd.current_dir(cwd);
    }

    // Apply environment variables
    for env_var in args.env.as_ref().into_iter().flatten() {
        cmd.env(&env_var.name, &env_var.value);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn terminal '{}': {}", resolved, e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    let stdin = child.stdin.take().ok_or("No stdin")?;

    let (tx, rx) = mpsc::channel::<Vec<u8>>();

    // Thread that writes to terminal stdin
    std::thread::spawn(move || {
        let mut stdin = stdin;
        for data in rx {
            if stdin.write_all(&data).is_err() {
                break;
            }
            if stdin.flush().is_err() {
                break;
            }
        }
    });

    let child_arc: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(Some(child)));

    // Thread that reads terminal stdout and emits to frontend
    let app_stdout = app.clone();
    let tid_stdout = terminal_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stdout.emit("terminal-output", TerminalOutputPayload {
                        terminal_id: tid_stdout.clone(),
                        output: format!("{}\n", data),
                    });
                }
                Err(_) => break,
            }
        }
    });

    // Thread that reads terminal stderr and emits to frontend
    let app_stderr = app.clone();
    let tid_stderr = terminal_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stderr.emit("terminal-output", TerminalOutputPayload {
                        terminal_id: tid_stderr.clone(),
                        output: format!("{}\n", data),
                    });
                }
                Err(_) => break,
            }
        }
    });

    // Thread that waits for process exit
    let app_exit = app.clone();
    let tid_exit = terminal_id.clone();
    let child_for_wait = Arc::clone(&child_arc);
    std::thread::spawn(move || {
        loop {
            let status_opt = {
                let mut guard = child_for_wait.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => c.try_wait().ok().flatten(),
                    None => break,
                }
            };
            match status_opt {
                Some(status) => {
                    let exit_code = status.code();
                    let signal: Option<String> = if status.code().is_none() {
                        #[cfg(unix)]
                        {
                            use std::os::unix::process::ExitStatusExt;
                            status.signal().map(|s| s.to_string())
                        }
                        #[cfg(not(unix))]
                        {
                            None
                        }
                    } else {
                        None
                    };
                    let _ = app_exit.emit("terminal-exit", TerminalExitPayload {
                        terminal_id: tid_exit.clone(),
                        exit_code,
                        signal,
                    });
                    break;
                }
                None => {
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
        }
    });

    // Store terminal process in state
    {
        let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
        terminals.insert(terminal_id.clone(), TerminalProcess {
            child: child_arc,
            stdin_tx: Mutex::new(Some(tx)),
        });
    }

    Ok(terminal_id)
}

/// Write data to a terminal's stdin.
#[tauri::command]
fn write_to_terminal(state: tauri::State<'_, AppState>, args: WriteToTerminalArgs) -> Result<(), String> {
    let terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    let tp = terminals.get(&args.terminal_id).ok_or("Terminal not found")?;
    let tx = tp.stdin_tx.lock().map_err(|e| e.to_string())?;
    match tx.as_ref() {
        Some(sender) => sender.send(args.data).map_err(|e| format!("Failed to write to terminal: {}", e)),
        None => Err("Terminal stdin closed".into()),
    }
}

/// Kill a terminal process.
#[tauri::command]
fn kill_terminal(state: tauri::State<'_, AppState>, args: TerminalIdArg) -> Result<(), String> {
    let terminals = state.terminals.lock().map_err(|e| e.to_string())?;
    let tp = terminals.get(&args.terminal_id).ok_or("Terminal not found")?;
    // Drop stdin sender so writer thread exits
    {
        let mut tx = tp.stdin_tx.lock().map_err(|e| e.to_string())?;
        *tx = None;
    }
    // Kill the process
    {
        let mut child_guard = tp.child.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut c) = *child_guard {
            let _ = c.kill();
            let _ = c.wait();
        }
        *child_guard = None;
    }
    Ok(())
}

/// Release a terminal (kill + remove from registry).
#[tauri::command]
fn release_terminal(state: tauri::State<'_, AppState>, args: TerminalIdArg) -> Result<(), String> {
    // Kill first
    {
        let terminals = state.terminals.lock().map_err(|e| e.to_string())?;
        if let Some(tp) = terminals.get(&args.terminal_id) {
            {
                let mut tx = tp.stdin_tx.lock().map_err(|e| e.to_string())?;
                *tx = None;
            }
            {
                let mut child_guard = tp.child.lock().map_err(|e| e.to_string())?;
                if let Some(ref mut c) = *child_guard {
                    let _ = c.kill();
                    let _ = c.wait();
                }
                *child_guard = None;
            }
        }
    }
    // Remove from registry
    {
        let mut terminals = state.terminals.lock().map_err(|e| e.to_string())?;
        terminals.remove(&args.terminal_id);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            agent: AgentBridge {
                tx: Mutex::new(None),
                child: Mutex::new(None),
            },
            terminals: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_agent,
            write_to_agent,
            kill_agent,
            create_terminal,
            write_to_terminal,
            kill_terminal,
            release_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
