import { ChatRoom } from './chatroom';
import type { Env } from './types';

// Export the Durable Object class
export { ChatRoom };



export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve the main HTML page
    if (url.pathname === '/' || url.pathname === '/index.html') {
      
      return new Response(HTML_CONTENT, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // WebSocket connections to rooms
    if (url.pathname.startsWith('/ws/')) {
      const roomId = url.pathname.split('/ws/')[1] || 'default';
      const id = env.CHATROOM.idFromName(roomId);
      const stub = env.CHATROOM.get(id);
      return stub.fetch(request);
    }

    // HTTP API endpoints
    if (url.pathname.startsWith('/api/room/')) {
      const pathParts = url.pathname.split('/');
      const roomId = pathParts[3];
      const endpoint = pathParts[4];

      if (!roomId) {
        return new Response('Room ID required', { status: 400 });
      }

      const id = env.CHATROOM.idFromName(roomId);
      const stub = env.CHATROOM.get(id);

      // Forward the request to the Durable Object
      const newUrl = new URL(request.url);
      newUrl.pathname = '/' + endpoint;
      const newRequest = new Request(newUrl, request);

      return stub.fetch(newRequest);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
