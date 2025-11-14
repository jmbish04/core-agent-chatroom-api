/**
 * @file This module provides utility functions for WebSocket communication.
 *
 * @description
 * This file contains a set of helpers for managing the WebSocket message
 * lifecycle, including:
 * 1.  Serializing and deserializing `WsMessage` objects to/from JSON strings.
 * 2.  A factory function (`buildFrame`) for creating standardized `WsMessage` frames.
 * 3.  A `broadcast` helper to send a message to multiple clients efficiently.
 * 4.  A generic `withRetry` utility for async operations.
 *
 * These utilities standardize the communication protocol used by the
 * Durable Objects (`RoomDO`, `AgentRoomDO`) and their clients.
 *
 * @module ws
 */

import type { WsMessage } from "../types";

/**
 * Serializes a `WsMessage` object into a JSON string for transmission
 * over the WebSocket.
 *
 * @param {WsMessage} message - The message object to serialize.
 * @returns {string} The JSON string representation of the message.
 */
export const serializeMessage = (message: WsMessage): string =>
  JSON.stringify(message);

/**
 * Safely deserializes a JSON string payload received from a WebSocket
 * into a `WsMessage` object.
 *
 * If parsing fails (e.g., malformed JSON), it logs the error and
 * returns a standardized `WsMessage` of type 'error' to prevent
 * the connection handler from crashing.
 *
 * @param {string} payload - The raw string payload from the WebSocket message event.
 * @returns {WsMessage} The parsed `WsMessage` object, or a fallback
 * error message if parsing fails.
 */
export const deserializeMessage = (payload: string): WsMessage => {
  try {
    return JSON.parse(payload) as WsMessage;
  } catch (error) {
    console.error("Failed to parse websocket payload", error);
    // Return a safe, standard error frame
    return { type: "error", payload: { message: "Malformed payload" } };
  }
};

/**
 * A type-safe factory function for constructing a standard `WsMessage` frame.
 * This ensures all messages follow a consistent structure.
 *
 * @template T - The type of the `payload` data.
 * @param {string} type - The message type, used for routing (e.g., "tasks.created", "system.heartbeat").
 * @param {T} payload - The data payload for the message.
 * @param {Record<string, unknown>} [meta] - Optional metadata to include.
 * @param {string} [requestId] - An optional ID to correlate a response to a request.
 * @returns {WsMessage<T>} The structured `WsMessage` object.
 */
export const buildFrame = <T>(
  type: string,
  payload: T,
  meta?: Record<string, unknown>,
  requestId?: string,
): WsMessage<T> => ({
  type,
  payload,
  meta,
  requestId,
});

/**
 * A generic async retry helper with exponential backoff.
 *
 * This function attempts to execute the provided async function (`fn`).
 * If it fails, it will wait for `delayMs` and try again, up to `retries`
 * times. The delay doubles after each failed attempt.
 *
 * @template T - The return type of the async function being executed.
 * @param {() => Promise<T>} fn - The async function to execute.
 * @param {number} [retries=3] - The number of retries remaining.
 * @param {number} [delayMs=150] - The initial delay, which will be doubled on subsequent retries.
 * @returns {Promise<T>} The result of the `fn` function.
 * @throws Will re-throw the error from `fn` if all retries are exhausted.
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 150,
): Promise<T> => {
  try {
    // Attempt to execute the function
    return await fn();
  } catch (error) {
    // If out of retries, throw the last error
    if (retries <= 0) {
      throw error;
    }
    // Wait for the specified delay
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    // Recurse with one less retry and doubled delay
    return withRetry(fn, retries - 1, delayMs * 2);
  }
};

/**
 * Broadcasts a `WsMessage` to multiple WebSocket clients efficiently.
 *
 * It serializes the message *once* before iterating over the clients,
 * reducing redundant serialization work.
 *
 * It includes a `try...catch` block inside the loop, allowing it to
 * continue sending to other clients even if one has a broken connection.
 * A warning is logged for any failed sends.
 *
 * @param {Iterable<WebSocket>} clients - An iterable (e.g., `Map.keys()`) of WebSocket clients.
 * @param {WsMessage} message - The message object to broadcast.
 */
export const broadcast = (clients: Iterable<WebSocket>, message: WsMessage) => {
  // Serialize the message once for all clients
  const payload = serializeMessage(message);

  for (const client of clients) {
    try {
      // Send the pre-serialized string
      client.send(payload);
    } catch (error) {
      // Log a warning but don't stop the loop.
      // This typically happens if a client disconnected abruptly.
      console.warn("Failed to forward frame to a client", error);
    }
  }
};