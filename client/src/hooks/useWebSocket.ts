import { useEffect, useRef, useState, useCallback } from 'react';

const RECONNECT_DELAY = 500;
const GRACE_PERIOD = 5000;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [stableConnected, setStableConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const listenersRef = useRef<Map<string, Set<(payload: any) => void>>>(new Map());
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[WS] Connecting to', wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        // Cancel grace period timer — we reconnected in time
        if (graceTimerRef.current) {
          clearTimeout(graceTimerRef.current);
          graceTimerRef.current = null;
        }
        setStableConnected(true);
      };

      ws.onerror = (e) => {
        console.error('[WS] Error', e);
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        // Start grace period — only show "connecting" after GRACE_PERIOD
        if (!graceTimerRef.current) {
          graceTimerRef.current = setTimeout(() => {
            graceTimerRef.current = null;
            setStableConnected(false);
          }, GRACE_PERIOD);
        }
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        setLastMessage(msg);

        const listeners = listenersRef.current.get(msg.type);
        if (listeners) {
          listeners.forEach(fn => fn(msg.payload));
        }

        const wildcard = listenersRef.current.get('*');
        if (wildcard) {
          wildcard.forEach(fn => fn(msg));
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const on = useCallback((type: string, handler: (payload: any) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  return { connected, stableConnected, send, on, lastMessage };
}
