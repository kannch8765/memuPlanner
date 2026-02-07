# MemU Planner - Memory API Client

A comprehensive Node.js client for the MemU API, providing memory operations for LLM applications including memorization, retrieval, and category management.

## Features

- 🔧 **Complete API Coverage**: All MemU API endpoints implemented
- 🚀 **Easy Integration**: Simple, intuitive API wrapper
- 📊 **Task Management**: Built-in task status monitoring and completion waiting
- 🔍 **Semantic Search**: Advanced memory retrieval with semantic search
- 📂 **Category Management**: Organized memory storage and retrieval
- 🛡️ **Error Handling**: Comprehensive error handling and validation
- 📖 **Rich Examples**: Detailed examples for all operations

## Installation

```bash
npm install
```

## Quick Start

1. **Set up your environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your MemU API key
   ```

2. **Basic usage:**
   ```javascript
   const MemUAPI = require('./src/memu-api');
   
   const memu = new MemUAPI('your_api_key_here');
   
   // Memorize a conversation
   const result = await memu.memorize(conversation, userId, agentId);
   console.log('Task ID:', result.task_id);
   ```

## API Reference

### MemUAPI Class

#### Constructor
```javascript
new MemUAPI(apiKey, baseUrl = 'https://api.memu.so')
```

#### Methods

##### memorize(conversation, userId, agentId, userName, agentName, sessionDate)
Register a memorization task to extract and store memories from a conversation.

**Parameters:**
- `conversation` (array): Array of message objects (minimum 3 messages required)
- `userId` (string): Unique user identifier
- `agentId` (string): Unique agent identifier
- `userName` (string, optional): Display name for user
- `agentName` (string, optional): Display name for agent
- `sessionDate` (string, optional): ISO 8601 session timestamp

**Returns:** Promise resolving to task object with `task_id` and `status`

##### getTaskStatus(taskId)
Get the status of a memorization task.

**Parameters:**
- `taskId` (string): Task ID from memorize endpoint

**Returns:** Promise resolving to status object

##### waitForTaskCompletion(taskId, timeout = 120)
Wait for a task to complete, polling status until success or timeout.

**Parameters:**
- `taskId` (string): Task ID to monitor
- `timeout` (number, optional): Timeout in seconds (default: 120)

**Returns:** Promise resolving to final status object

##### getCategories(userId, agentId)
Retrieve all memory categories for a user/agent combination.

**Parameters:**
- `userId` (string): Unique user identifier
- `agentId` (string): Unique agent identifier

**Returns:** Promise resolving to categories array

##### retrieve(userId, agentId, query, limit = 10, category = null)
Retrieve memories using semantic search.

**Parameters:**
- `userId` (string): Unique user identifier
- `agentId` (string): Unique agent identifier
- `query` (string): Search query
- `limit` (number, optional): Maximum results (default: 10)
- `category` (string, optional): Filter by category

**Returns:** Promise resolving to memories array

##### delete(userId, agentId, category = null)
Delete user or agent memories.

**Parameters:**
- `userId` (string): Unique user identifier
- `agentId` (string): Unique agent identifier
- `category` (string, optional): Delete specific category (if omitted, deletes all)

**Returns:** Promise resolving to deletion result

## Examples

### Run All Examples
```bash
npm start
```

### Individual Examples
```bash
# Memorization example
node src/examples/memorize.js

# Task status monitoring
node src/examples/task-status.js

# Category management
node src/examples/categories.js

# Memory retrieval
node src/examples/retrieve.js

# Memory deletion
node src/examples/delete.js
```

## Project Structure

```
memuPlanner/
├── src/
│   ├── memu-api.js          # Main API client
│   ├── index.js             # Package entry point
│   ├── examples.js          # Comprehensive examples
│   └── examples/
│       ├── memorize.js      # Memorization example
│       ├── task-status.js   # Task monitoring example
│       ├── categories.js    # Categories example
│       ├── retrieve.js      # Memory retrieval example
│       └── delete.js        # Memory deletion example
├── package.json
├── .env.example
└── README.md
```

## Error Handling

The client includes comprehensive error handling:

```javascript
try {
    const result = await memu.memorize(conversation, userId, agentId);
} catch (error) {
    console.error('Memorization failed:', error.message);
    // Handle specific error cases
}
```

## Best Practices

1. **Always validate API key**: Check that your API key is set before making requests
2. **Handle timeouts**: Use appropriate timeout values for `waitForTaskCompletion`
3. **Monitor task status**: Don't assume tasks complete immediately
4. **Use semantic queries**: For retrieval, use natural language queries
5. **Confirm deletions**: Always confirm with users before deleting memories
6. **Implement backups**: Consider backing up important memories before deletion

## Environment Variables

- `MEMU_API_KEY`: Your MemU API key (required)
- `MEMU_BASE_URL`: API base URL (optional, defaults to https://api.memu.so)

## License

MIT

## Support

For MemU API support, please refer to the official API documentation or contact MemU support.

---

Built for the Vibe Coding with Memory Hackathon 20260207 🚀