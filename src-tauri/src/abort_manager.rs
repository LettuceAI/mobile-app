use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;

#[derive(Debug)]
pub struct AbortHandle {
    tx: Option<oneshot::Sender<()>>,
}

impl AbortHandle {
    pub fn new(tx: oneshot::Sender<()>) -> Self {
        Self { tx: Some(tx) }
    }

    pub fn abort(&mut self) {
        if let Some(tx) = self.tx.take() {
            let _ = tx.send(());
        }
    }
}

#[derive(Clone)]
pub struct AbortRegistry {
    inner: Arc<Mutex<HashMap<String, AbortHandle>>>,
}

impl AbortRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, request_id: String) -> oneshot::Receiver<()> {
        let (tx, rx) = oneshot::channel();
        let handle = AbortHandle::new(tx);

        if let Ok(mut map) = self.inner.lock() {
            map.insert(request_id, handle);
        }

        rx
    }

    pub fn abort(&self, request_id: &str) -> Result<(), String> {
        if let Ok(mut map) = self.inner.lock() {
            if let Some(mut handle) = map.remove(request_id) {
                handle.abort();
                Ok(())
            } else {
                Err(format!(
                    "Request {} not found or already completed",
                    request_id
                ))
            }
        } else {
            Err(crate::utils::err_msg(
                module_path!(),
                line!(),
                "Failed to acquire lock on abort registry",
            ))
        }
    }

    pub fn unregister(&self, request_id: &str) {
        if let Ok(mut map) = self.inner.lock() {
            map.remove(request_id);
        }
    }

    #[allow(dead_code)]
    pub fn is_registered(&self, request_id: &str) -> bool {
        if let Ok(map) = self.inner.lock() {
            map.contains_key(request_id)
        } else {
            false
        }
    }
}

impl Default for AbortRegistry {
    fn default() -> Self {
        Self::new()
    }
}
