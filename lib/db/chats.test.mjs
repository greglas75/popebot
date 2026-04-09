import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./index.js', () => ({
  getDb: vi.fn(),
}));

vi.mock('crypto', async (importOriginal) => ({
  ...(await importOriginal()),
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

import { getDb } from './index.js';
import { randomUUID } from 'crypto';
import { eq, and, desc, asc } from 'drizzle-orm';
import { chats, messages } from './schema.js';
import {
  createChat,
  getChatsByUser,
  getChatById,
  getChatByWorkspaceId,
  updateChatTitle,
  toggleChatStarred,
  deleteChat,
  deleteAllChatsByUser,
  getMessagesByChatId,
  linkChatToWorkspace,
  saveMessage,
} from './chats.js';

/**
 * Factory for Drizzle-style chainable mock DB.
 * Each method returns named handles to terminal and intermediate mock functions
 * for verification in tests.
 */
function createMockDb() {
  const insertRun = vi.fn();
  const selectGet = vi.fn();
  const selectAll = vi.fn(() => []);
  const updateRun = vi.fn();
  const deleteRun = vi.fn();

  const insertValues = vi.fn(() => ({ run: insertRun }));
  const selectOrderBy = vi.fn(() => ({ all: selectAll }));
  const selectWhere = vi.fn(() => ({ get: selectGet, all: selectAll, orderBy: selectOrderBy }));
  const selectFrom = vi.fn(() => ({ where: selectWhere, orderBy: selectOrderBy }));
  const updateWhere = vi.fn(() => ({ run: updateRun }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const deleteWhere = vi.fn(() => ({ run: deleteRun }));

  return {
    db: {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi.fn(() => ({ from: selectFrom })),
      update: vi.fn(() => ({ set: updateSet })),
      delete: vi.fn(() => ({ where: deleteWhere })),
    },
    insertRun, insertValues,
    selectGet, selectAll, selectFrom, selectWhere, selectOrderBy,
    updateRun, updateSet, updateWhere,
    deleteRun, deleteWhere,
  };
}

let mock;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1700000000000);
  vi.clearAllMocks();
  mock = createMockDb();
  getDb.mockReturnValue(mock.db);
  randomUUID.mockReturnValue('test-uuid-1234');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createChat', () => {
  it('returns chat with auto-generated UUID when no ID provided', () => {
    const result = createChat('user-1');
    expect(result.id).toBe('test-uuid-1234');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('uses provided ID instead of generating one', () => {
    const result = createChat('user-1', 'Title', 'custom-id');
    expect(result.id).toBe('custom-id');
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('generates UUID when ID is empty string (falsy)', () => {
    const result = createChat('user-1', 'Title', '');
    expect(result.id).toBe('test-uuid-1234');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('defaults title to "New Chat"', () => {
    const result = createChat('user-1');
    expect(result.title).toBe('New Chat');
  });

  it('uses provided title', () => {
    const result = createChat('user-1', 'My Custom Chat');
    expect(result.title).toBe('My Custom Chat');
  });

  it('defaults chatMode to "agent" when not in options', () => {
    const result = createChat('user-1');
    expect(result.chatMode).toBe('agent');
  });

  it('defaults chatMode to "agent" when options.chatMode is empty string', () => {
    const result = createChat('user-1', 'Title', null, { chatMode: '' });
    expect(result.chatMode).toBe('agent');
  });

  it('uses chatMode from options when provided', () => {
    const result = createChat('user-1', 'Title', null, { chatMode: 'code' });
    expect(result.chatMode).toBe('code');
  });

  it('inserts complete chat record with correct userId and timestamps', () => {
    createChat('user-42', 'Test Chat', null, { chatMode: 'code' });

    expect(mock.db.insert).toHaveBeenCalledWith(chats);
    expect(mock.insertValues).toHaveBeenCalledWith({
      id: 'test-uuid-1234',
      userId: 'user-42',
      title: 'Test Chat',
      chatMode: 'code',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    expect(mock.insertRun).toHaveBeenCalledOnce();
  });
});

describe('getChatsByUser', () => {
  it('returns chats from database for given user', () => {
    const chatList = [
      { id: '1', userId: 'u1', title: 'Chat A' },
      { id: '2', userId: 'u1', title: 'Chat B' },
    ];
    mock.selectAll.mockReturnValue(chatList);

    const result = getChatsByUser('u1');
    expect(result).toEqual(chatList);
    expect(mock.selectFrom).toHaveBeenCalledWith(chats);
    expect(mock.selectWhere).toHaveBeenCalledWith(and(eq(chats.userId, 'u1'), eq(chats.archived, 0)));
    expect(mock.selectOrderBy).toHaveBeenCalledWith(desc(chats.updatedAt));
  });

  it('returns empty array when user has no chats', () => {
    mock.selectAll.mockReturnValue([]);
    expect(getChatsByUser('unknown-user')).toEqual([]);
    expect(mock.selectWhere).toHaveBeenCalledWith(and(eq(chats.userId, 'unknown-user'), eq(chats.archived, 0)));
  });
});

describe('getChatById', () => {
  it('returns chat when found', () => {
    const chat = { id: 'c1', title: 'Found Chat' };
    mock.selectGet.mockReturnValue(chat);

    expect(getChatById('c1')).toEqual(chat);
    expect(mock.selectFrom).toHaveBeenCalledWith(chats);
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.id, 'c1'));
  });

  it('returns undefined when not found', () => {
    mock.selectGet.mockReturnValue(undefined);
    expect(getChatById('nonexistent')).toBeUndefined();
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.id, 'nonexistent'));
  });
});

describe('getChatByWorkspaceId', () => {
  it('returns chat when found by workspace ID', () => {
    const chat = { id: 'c1', codeWorkspaceId: 'ws-1' };
    mock.selectGet.mockReturnValue(chat);

    expect(getChatByWorkspaceId('ws-1')).toEqual(chat);
    expect(mock.selectFrom).toHaveBeenCalledWith(chats);
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.codeWorkspaceId, 'ws-1'));
  });

  it('returns undefined when workspace not linked to any chat', () => {
    mock.selectGet.mockReturnValue(undefined);
    expect(getChatByWorkspaceId('no-workspace')).toBeUndefined();
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.codeWorkspaceId, 'no-workspace'));
  });
});

describe('updateChatTitle', () => {
  it('updates title and sets updatedAt to current timestamp', () => {
    updateChatTitle('chat-1', 'Renamed Chat');

    expect(mock.db.update).toHaveBeenCalledWith(chats);
    expect(mock.updateSet).toHaveBeenCalledWith({
      title: 'Renamed Chat',
      updatedAt: 1700000000000,
    });
    expect(mock.updateWhere).toHaveBeenCalledWith(eq(chats.id, 'chat-1'));
    expect(mock.updateRun).toHaveBeenCalledOnce();
  });
});

describe('toggleChatStarred', () => {
  it('returns 0 when chat is currently starred (starred=1)', () => {
    mock.selectGet.mockReturnValue({ starred: 1 });
    expect(toggleChatStarred('chat-1')).toBe(0);
  });

  it('returns 1 when chat is currently not starred (starred=0)', () => {
    mock.selectGet.mockReturnValue({ starred: 0 });
    expect(toggleChatStarred('chat-1')).toBe(1);
  });

  it('returns 1 when chat is not found (get returns undefined)', () => {
    mock.selectGet.mockReturnValue(undefined);
    // chat?.starred = undefined, falsy → newValue = 1
    expect(toggleChatStarred('nonexistent')).toBe(1);
    // Intentional: still writes starred=1 to DB for nonexistent row (no-op update)
    expect(mock.updateSet).toHaveBeenCalledWith({ starred: 1 });
    expect(mock.updateRun).toHaveBeenCalledOnce();
  });

  it('writes toggled value to database', () => {
    mock.selectGet.mockReturnValue({ starred: 1 });
    toggleChatStarred('chat-1');

    expect(mock.db.update).toHaveBeenCalledWith(chats);
    expect(mock.updateSet).toHaveBeenCalledWith({ starred: 0 });
    expect(mock.updateWhere).toHaveBeenCalledWith(eq(chats.id, 'chat-1'));
    expect(mock.updateRun).toHaveBeenCalledOnce();
  });

  it('reads starred value via select before updating', () => {
    mock.selectGet.mockReturnValue({ starred: 0 });
    toggleChatStarred('chat-1');

    expect(mock.db.select).toHaveBeenCalledOnce();
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.id, 'chat-1'));
    expect(mock.db.update).toHaveBeenCalledWith(chats);
    expect(mock.updateSet).toHaveBeenCalledWith({ starred: 1 });
  });
});

describe('deleteChat', () => {
  it('deletes messages table rows before chat table row', () => {
    deleteChat('chat-1');

    expect(mock.db.delete).toHaveBeenCalledTimes(2);
    // Order: messages first, then chats
    expect(mock.db.delete.mock.calls[0][0]).toBe(messages);
    expect(mock.db.delete.mock.calls[1][0]).toBe(chats);
    // Verify WHERE clauses target correct columns
    expect(mock.deleteWhere.mock.calls[0][0]).toEqual(eq(messages.chatId, 'chat-1'));
    expect(mock.deleteWhere.mock.calls[1][0]).toEqual(eq(chats.id, 'chat-1'));
  });

  it('executes run on both delete operations', () => {
    deleteChat('chat-1');
    expect(mock.deleteRun).toHaveBeenCalledTimes(2);
  });
});

describe('deleteAllChatsByUser', () => {
  it('deletes messages for each user chat then deletes all user chats', () => {
    mock.selectAll.mockReturnValue([{ id: 'c1' }, { id: 'c2' }]);

    deleteAllChatsByUser('user-1');

    // 2 message deletes (one per chat) + 1 chats delete = 3
    expect(mock.db.delete).toHaveBeenCalledTimes(3);
    expect(mock.db.delete.mock.calls[0][0]).toBe(messages);
    expect(mock.db.delete.mock.calls[1][0]).toBe(messages);
    expect(mock.db.delete.mock.calls[2][0]).toBe(chats);
    // Verify WHERE clauses use correct IDs per chat
    expect(mock.deleteWhere.mock.calls[0][0]).toEqual(eq(messages.chatId, 'c1'));
    expect(mock.deleteWhere.mock.calls[1][0]).toEqual(eq(messages.chatId, 'c2'));
    expect(mock.deleteWhere.mock.calls[2][0]).toEqual(eq(chats.userId, 'user-1'));
  });

  it('handles user with no chats (only deletes from chats table)', () => {
    mock.selectAll.mockReturnValue([]);

    deleteAllChatsByUser('user-1');

    // No message deletes, only 1 chats delete
    expect(mock.db.delete).toHaveBeenCalledTimes(1);
    expect(mock.db.delete.mock.calls[0][0]).toBe(chats);
    expect(mock.deleteWhere).toHaveBeenCalledWith(eq(chats.userId, 'user-1'));
  });

  it('queries chat IDs from the chats table for the given user', () => {
    mock.selectAll.mockReturnValue([]);
    deleteAllChatsByUser('user-1');

    expect(mock.db.select).toHaveBeenCalledOnce();
    expect(mock.selectFrom).toHaveBeenCalledWith(chats);
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(chats.userId, 'user-1'));
  });
});

describe('getMessagesByChatId', () => {
  it('returns messages for the given chat', () => {
    const msgList = [
      { id: 'm1', chatId: 'c1', role: 'user', content: 'Hello' },
      { id: 'm2', chatId: 'c1', role: 'assistant', content: 'Hi there' },
    ];
    mock.selectAll.mockReturnValue(msgList);

    expect(getMessagesByChatId('c1')).toEqual(msgList);
    expect(mock.selectFrom).toHaveBeenCalledWith(messages);
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(messages.chatId, 'c1'));
    expect(mock.selectOrderBy).toHaveBeenCalledWith(asc(messages.createdAt));
  });

  it('returns empty array when chat has no messages', () => {
    mock.selectAll.mockReturnValue([]);
    expect(getMessagesByChatId('empty-chat')).toEqual([]);
    expect(mock.selectWhere).toHaveBeenCalledWith(eq(messages.chatId, 'empty-chat'));
  });
});

describe('linkChatToWorkspace', () => {
  it('sets codeWorkspaceId and updates timestamp', () => {
    linkChatToWorkspace('chat-1', 'workspace-99');

    expect(mock.db.update).toHaveBeenCalledWith(chats);
    expect(mock.updateSet).toHaveBeenCalledWith({
      codeWorkspaceId: 'workspace-99',
      updatedAt: 1700000000000,
    });
    expect(mock.updateWhere).toHaveBeenCalledWith(eq(chats.id, 'chat-1'));
    expect(mock.updateRun).toHaveBeenCalledOnce();
  });
});

describe('saveMessage', () => {
  it('returns message with auto-generated UUID when no ID provided', () => {
    const result = saveMessage('chat-1', 'user', 'Hello');
    expect(result.id).toBe('test-uuid-1234');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('uses provided ID instead of generating one', () => {
    const result = saveMessage('chat-1', 'user', 'Hello', 'custom-msg-id');
    expect(result.id).toBe('custom-msg-id');
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('generates UUID when ID is empty string (falsy)', () => {
    const result = saveMessage('chat-1', 'user', 'Hello', '');
    expect(result.id).toBe('test-uuid-1234');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('returns message with correct chatId, role, content, and timestamp', () => {
    const result = saveMessage('chat-1', 'assistant', 'Hi there');
    expect(result).toEqual({
      id: 'test-uuid-1234',
      chatId: 'chat-1',
      role: 'assistant',
      content: 'Hi there',
      createdAt: 1700000000000,
    });
  });

  it('inserts message record into messages table', () => {
    saveMessage('chat-1', 'user', 'Test message');

    expect(mock.db.insert).toHaveBeenCalledWith(messages);
    expect(mock.insertValues).toHaveBeenCalledWith({
      id: 'test-uuid-1234',
      chatId: 'chat-1',
      role: 'user',
      content: 'Test message',
      createdAt: 1700000000000,
    });
    expect(mock.insertRun).toHaveBeenCalledOnce();
  });

  it('updates parent chat updatedAt timestamp', () => {
    saveMessage('chat-1', 'user', 'Hello');

    expect(mock.db.update).toHaveBeenCalledWith(chats);
    expect(mock.updateSet).toHaveBeenCalledWith({ updatedAt: 1700000000000 });
    expect(mock.updateWhere).toHaveBeenCalledWith(eq(chats.id, 'chat-1'));
    expect(mock.updateRun).toHaveBeenCalledOnce();
  });
});
