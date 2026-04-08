import { Transform } from 'stream';
import split2 from 'split2';
import { DockerFrameParser } from '../tools/docker.js';

// Re-export from line-mappers for existing consumers
export {
  mapLine,
  mapClaudeCodeLine,
  mapPiLine,
  mapGeminiLine,
  mapCodexLine,
  mapOpenCodeLine,
  mapKimiLine,
} from './line-mappers.js';

import {
  mapLine,
  mapClaudeCodeLine,
  mapPiLine,
  mapGeminiLine,
  mapCodexLine,
  mapOpenCodeLine,
  mapKimiLine,
} from './line-mappers.js';

/**
 * Parse Docker container logs from a headless coding agent container.
 * Supports multiple agent output formats (Claude Code, Pi).
 *
 * Three layers:
 * 1. Docker multiplexed frame decoder (Transform stream)
 * 2. split2 for reliable NDJSON line splitting
 * 3. Agent-specific NDJSON → chat event mapper
 *
 * @param {import('http').IncomingMessage} dockerLogStream - Raw Docker log stream
 * @param {string} [codingAgent='claude-code'] - Which agent format to parse
 * @yields {{ type: string, text?: string, toolCallId?: string, toolName?: string, args?: object, result?: string }}
 */
export async function* parseHeadlessStream(dockerLogStream, codingAgent = 'claude-code') {
  const mapperMap = {
    'claude-code': mapClaudeCodeLine,
    'pi-coding-agent': mapPiLine,
    'gemini-cli': mapGeminiLine,
    'codex-cli': mapCodexLine,
    'opencode': mapOpenCodeLine,
    'kimi-cli': mapKimiLine,
  };
  const mapper = mapperMap[codingAgent] || mapClaudeCodeLine;

  // Layer 1: Docker frame decoder using shared DockerFrameParser
  const parser = new DockerFrameParser();
  const frameDecoder = new Transform({
    transform(chunk, encoding, callback) {
      for (const frame of parser.push(chunk)) {
        if (frame.stream === 'stdout') {
          this.push(Buffer.from(frame.text, 'utf8'));
        }
      }
      callback();
    }
  });

  // Layer 2: split2 for reliable line splitting
  const lines = dockerLogStream.pipe(frameDecoder).pipe(split2());

  // Layer 3: map each complete line to chat events
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const event of mapLine(trimmed, mapper)) {
      yield event;
    }
  }
}
