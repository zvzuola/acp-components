#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use tauri::Manager;

/// Wrapper to allow IPC commands to write to the agent's stdin.
struct AgentBridge {
    /// Sender side of a channel whose receiver thread writes to agent stdin.
    tx: Mutex<Option<mpsc::Sender<Vec<u8>>>>,
    /// The child process handle, kept for cleanup. Shared with the exit-monitor thread.
    child: Arc<Mutex<Option<Child>>>,
}

struct AppState {
    agents: Mutex<HashMap<String, AgentBridge>>,
}

#[derive(Deserialize)]
struct StartAgentArgs {
    agent_id: String,
    command: String,
    #[serde(default)]
    args: Vec<String>,
}

#[derive(Deserialize)]
struct AgentActionArgs {
    agent_id: String,
}

#[derive(Deserialize)]
struct WriteToAgentArgs {
    agent_id: String,
    data: Vec<u8>,
}

#[derive(Serialize, Clone)]
struct AgentOutputPayload {
    agent_id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct AgentErrorPayload {
    agent_id: String,
    message: String,
}

#[derive(Serialize, Clone)]
struct AgentStatusPayload {
    agent_id: String,
}

fn resolve_command(cmd: &str) -> String {
    if cfg!(target_os = "windows") && !cmd.ends_with(".exe") && !cmd.ends_with(".cmd") && !cmd.ends_with(".bat") {
        format!("{}.cmd", cmd)
    } else {
        cmd.to_string()
    }
}

/// Resolve a command string against the given base directory.
///
/// - Absolute paths are returned as-is.
/// - Relative paths containing `/` or `\` are resolved against `base_dir`.
/// - Bare command names are checked in `base_dir` first; if found, the local
///   path is returned. Otherwise the name is returned for PATH lookup.
fn resolve_command_path(cmd: &str, base_dir: &std::path::Path) -> String {
    let resolved = resolve_command(cmd);
    let path = std::path::Path::new(&resolved);

    if path.is_absolute() {
        return resolved;
    }

    if resolved.contains('/') || resolved.contains('\\') {
        return base_dir.join(&resolved).to_string_lossy().to_string();
    }

    // Bare command name — prefer a local copy over PATH
    let local = base_dir.join(&resolved);
    if local.exists() {
        return local.to_string_lossy().to_string();
    }

    resolved
}

/// Spawn the agent subprocess and begin bridging its stdio to the frontend
/// via Tauri events. The frontend communicates with the agent through
/// `write_to_agent` (stdin) and listens to the `agent-output` event (stdout).
#[tauri::command]
fn start_agent(state: tauri::State<'_, AppState>, app: tauri::AppHandle, args: StartAgentArgs) -> Result<(), String> {
    let agent_id = args.agent_id.clone();

    // Guard against double-start for the same agent
    {
        let agents = state.agents.lock().map_err(|e| e.to_string())?;
        if agents.contains_key(&agent_id) {
            return Err(format!("Agent '{}' is already running", agent_id));
        }
    }

    let resource_dir = app.path().resource_dir().map_err(|e: tauri::Error| e.to_string())?;
    let mut resolved = resolve_command_path(&args.command, &resource_dir);

    // In dev mode resources aren't auto-copied to target dir.
    // Fall back to the project agents directory.
    if !std::path::Path::new(&resolved).exists() {
        let agents_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("agents");
        let fallback = resolve_command_path(&args.command, &agents_dir);
        if std::path::Path::new(&fallback).exists() {
            resolved = fallback;
        }
    }
    println!("[{}] Starting agent with command: {} {:?}", agent_id, resolved, args.args);

    let mut cmd = Command::new(&resolved);
    cmd.args(&args.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows: CREATE_NO_WINDOW hides the console for child processes
    #[cfg(windows)]
    {
        std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn agent '{}': {}", resolved, e))?;

    println!("[{}] Agent process started with PID: {}", agent_id, child.id());

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
    let aid_stdout = agent_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stdout.emit("agent-output", AgentOutputPayload {
                        agent_id: aid_stdout.clone(),
                        data,
                    });
                }
                Err(_) => break,
            }
        }
    });

    // Thread that reads agent stderr and emits to frontend
    let app_stderr = app.clone();
    let aid_stderr = agent_id.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(data) => {
                    let _ = app_stderr.emit("agent-stderr", AgentOutputPayload {
                        agent_id: aid_stderr.clone(),
                        data,
                    });
                }
                Err(_) => break,
            }
        }
    });

    // Thread that monitors agent process exit
    let child_arc = Arc::new(Mutex::new(Some(child)));
    let app_exit = app.clone();
    let aid_exit = agent_id.clone();
    let child_for_wait = Arc::clone(&child_arc);
    std::thread::spawn(move || {
        loop {
            let exited = {
                let mut guard = child_for_wait.lock().unwrap();
                match guard.as_mut() {
                    Some(c) => c.try_wait().ok().flatten().is_some(),
                    None => break,
                }
            };
            if exited {
                let _ = app_exit.emit("agent-closed", AgentStatusPayload {
                    agent_id: aid_exit,
                });
                let mut guard = child_for_wait.lock().unwrap();
                *guard = None;
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    });

    // Store channel sender and child handle
    {
        let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
        agents.insert(agent_id.clone(), AgentBridge {
            tx: Mutex::new(Some(tx)),
            child: child_arc,
        });
    }

    let _ = app.emit("agent-started", AgentStatusPayload { agent_id });
    Ok(())
}

/// Write raw data to the agent's stdin. Called by the frontend transport.
#[tauri::command]
fn write_to_agent(state: tauri::State<'_, AppState>, args: WriteToAgentArgs) -> Result<(), String> {
    let agents = state.agents.lock().map_err(|e| e.to_string())?;
    let bridge = agents.get(&args.agent_id).ok_or(format!("Agent '{}' not found", args.agent_id))?;
    let tx = bridge.tx.lock().map_err(|e| e.to_string())?;
    match tx.as_ref() {
        Some(sender) => sender.send(args.data).map_err(|e| format!("Failed to write to agent: {}", e)),
        None => Err("Agent stdin closed".into()),
    }
}

/// Kill the agent subprocess and clean up resources.
#[tauri::command]
fn kill_agent(state: tauri::State<'_, AppState>, app: tauri::AppHandle, args: AgentActionArgs) -> Result<(), String> {
    let agent_id = args.agent_id.clone();

    // Drop the channel sender first so the stdin writer thread exits
    {
        let agents = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(bridge) = agents.get(&agent_id) {
            let mut tx = bridge.tx.lock().map_err(|e| e.to_string())?;
            *tx = None;
        }
    }
    // Kill the child process
    {
        let mut agents = state.agents.lock().map_err(|e| e.to_string())?;
        if let Some(bridge) = agents.remove(&agent_id) {
            let mut child_guard = bridge.child.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut c) = *child_guard {
                let _ = c.kill();
                let _ = c.wait();
            }
            *child_guard = None;
        }
    }
    let _ = app.emit("agent-closed", AgentStatusPayload { agent_id });
    Ok(())
}

// ---------------------------------------------------------------------------
// Workspace persistence — save/load opened workspace directories so they
// are automatically restored on the next app launch.
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SaveWorkspacesArgs {
    workspaces: Vec<String>,
}

#[derive(Serialize)]
struct LoadWorkspacesResult {
    workspaces: Vec<String>,
}

fn workspaces_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("workspaces.json"))
}

#[tauri::command]
fn save_workspaces(app: tauri::AppHandle, args: SaveWorkspacesArgs) -> Result<(), String> {
    let file_path = workspaces_file_path(&app)?;
    let json = serde_json::to_string(&args.workspaces).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| e.to_string())?;
    println!("[workspaces] Saved {} workspace(s)", args.workspaces.len());
    Ok(())
}

#[tauri::command]
fn load_workspaces(app: tauri::AppHandle) -> Result<LoadWorkspacesResult, String> {
    let file_path = workspaces_file_path(&app)?;
    match fs::read_to_string(&file_path) {
        Ok(json) => {
            let workspaces: Vec<String> = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            println!("[workspaces] Loaded {} workspace(s)", workspaces.len());
            Ok(LoadWorkspacesResult { workspaces })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Ok(LoadWorkspacesResult { workspaces: vec![] })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            agents: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            start_agent,
            write_to_agent,
            kill_agent,
            save_workspaces,
            load_workspaces,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
