/* In-memory meeting room. The worker keeps one of these inside a Durable Object. */

export function createRoom() {
  const members = [];
  const tasks = new Map();
  const gossip = [];
  return {
    members() { return members.slice(); },
    join(id) {
      if (!members.includes(id)) members.push(id);
      const out = [];
      if (members.length === 2) out.push({ to: members[0], msg: { t: 'start' } });
      return out;
    },
    leave(id) {
      const index = members.indexOf(id);
      if (index >= 0) members.splice(index, 1);
    },
    relay(from, msg) {
      return members.filter((id) => id !== from).map((to) => ({ to, msg: { ...msg, from } }));
    },
    putChunk(taskId, seq, total, data) {
      const task = tasks.get(taskId) || { total: 0, chunks: [] };
      task.total = Math.max(0, Math.min(64, Number(total) || 0));
      task.chunks[Math.max(0, Number(seq) || 0)] = String(data).slice(0, 16000);
      tasks.set(taskId, task);
      return task.chunks.filter((chunk) => chunk != null).length >= task.total && task.total > 0;
    },
    getTask(taskId) {
      return tasks.get(taskId) || null;
    },
    noteGossip(item) {
      gossip.push(item);
      if (gossip.length > 50) gossip.shift();
      return members.slice();
    },
  };
}
