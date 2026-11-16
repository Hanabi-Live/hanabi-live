//! Limits the live connections that one network can hold open, so that a few networks cannot use
//! every connection that the server allows.

use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex, PoisonError},
};

/// The most live connections open at once from one network (see `accounts::network_key`).
pub(super) const MAX_SOCKETS_PER_NETWORK: usize = 20;

/// The number of live connections open from each network.
#[derive(Default)]
pub(super) struct NetworkSockets(Arc<Mutex<HashMap<IpAddr, usize>>>);

/// One live connection from a network. Dropping it frees the place.
pub(super) struct NetworkSlot {
    counts: Arc<Mutex<HashMap<IpAddr, usize>>>,
    /// `None` for an address that is not limited, such as loopback.
    network: Option<IpAddr>,
}

impl NetworkSockets {
    /// Takes a place for a connection from an address, or returns `None` if its network already
    /// has `MAX_SOCKETS_PER_NETWORK` connections.
    pub(super) fn acquire(&self, ip: IpAddr) -> Option<NetworkSlot> {
        let network = crate::accounts::network_key(ip);
        if let Some(network) = network {
            let mut counts = self.0.lock().unwrap_or_else(PoisonError::into_inner);
            let count = counts.entry(network).or_default();
            if *count >= MAX_SOCKETS_PER_NETWORK {
                return None;
            }
            *count += 1;
        }
        Some(NetworkSlot {
            counts: self.0.clone(),
            network,
        })
    }
}

impl Drop for NetworkSlot {
    fn drop(&mut self) {
        let Some(network) = self.network else {
            return;
        };
        let mut counts = self.counts.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(count) = counts.get_mut(&network) {
            *count -= 1;
            if *count == 0 {
                counts.remove(&network);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_each_network_and_frees_places() {
        let sockets = NetworkSockets::default();
        let address = |text: &str| text.parse::<IpAddr>().unwrap();
        let mut slots: Vec<_> = (0..MAX_SOCKETS_PER_NETWORK)
            .map(|i| {
                // Addresses in the same IPv6 /64 network share one limit.
                sockets
                    .acquire(address(&format!("2001:db8::{i:x}")))
                    .expect("a place")
            })
            .collect();
        assert!(sockets.acquire(address("2001:db8::ffff")).is_none());
        // Other networks, and loopback, are not affected.
        assert!(sockets.acquire(address("2001:db8:0:1::1")).is_some());
        assert!(sockets.acquire(address("192.0.2.1")).is_some());
        let loopback: Vec<_> = (0..=MAX_SOCKETS_PER_NETWORK)
            .map(|_| sockets.acquire(address("127.0.0.1")))
            .collect();
        assert!(loopback.iter().all(Option::is_some));
        slots.pop();
        assert!(sockets.acquire(address("2001:db8::ffff")).is_some());
        drop(slots);
        assert!(sockets.0.lock().unwrap().is_empty());
    }
}
