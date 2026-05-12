use serde::Deserialize;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use tauri::Emitter;

/// Wrapper to allow IPC commands to write to the agent's stdin.
struct AgentBridge {
    /// Sender side of a channel whose receiver thread writes to agent stdin.
    tx: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
    /// The child process handle, kept for cleanup.
    child: Mutex<Option<Child>>,
}

#[derive(Deserialize)]
struct StartAgentArgs {
    command: String,
    #[serde(default)]
    args: Vec<String>,
}

fn resolve_command(cmd: &str) -> String {
    if cfg!(target_os = "windows") && !cmd.ends_with(".exe") && !cmd.ends_with(".cmd") && !cmd.ends_with(".bat") {
        format!("{}.cmd", cmd)
    } else {
        cmd.to_string()
    }
}

/// Spawn the agent subprocess and begin bridging its stdio to the frontend
/// via Tauri events. The frontend communicates with the agent through
/// `write_to_agent` (stdin) and listens to the `agent-output` event (stdout).
#[tauri::command]
fn start_agent(state: tauri::State<'_, AgentBridge>, app: tauri::AppHandle, args: StartAgentArgs) -> Result<(), String> {
    // Guard against double-start
    {
        let tx = state.tx.lock().map_err(|e| e.to_string())?;
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
        let mut tx_guard = state.tx.lock().map_err(|e| e.to_string())?;
        *tx_guard = Some(tx);
    }
    {
        let mut child_guard = state.child.lock().map_err(|e| e.to_string())?;
        *child_guard = Some(child);
    }

    let _ = app.emit("agent-started", ());
    Ok(())
}

/// Write raw data to the agent's stdin. Called by the frontend transport.
#[tauri::command]
fn write_to_agent(state: tauri::State<'_, AgentBridge>, data: Vec<u8>) -> Result<(), String> {
    let tx = state.tx.lock().map_err(|e| e.to_string())?;
    match tx.as_ref() {
        Some(sender) => sender.send(data).map_err(|e| format!("Failed to write to agent: {}", e)),
        None => Err("Agent not started".into()),
    }
}

/// Kill the agent subprocess and clean up resources.
#[tauri::command]
fn kill_agent(state: tauri::State<'_, AgentBridge>, app: tauri::AppHandle) -> Result<(), String> {
    // Drop the channel sender first so the stdin writer thread exits
    {
        let mut tx = state.tx.lock().map_err(|e| e.to_string())?;
        *tx = None;
    }
    // Kill the child process
    {
        let mut child = state.child.lock().map_err(|e| e.to_string())?;
        if let Some(ref mut c) = *child {
            let _ = c.kill();
            let _ = c.wait();
        }
        *child = None;
    }
    let _ = app.emit("agent-closed", ());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AgentBridge {
            tx: Mutex::new(None),
            child: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![start_agent, write_to_agent, kill_agent])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
