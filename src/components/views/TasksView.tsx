import React, { useState } from 'react';
import { 
  CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  Clock, 
  FolderKanban, 
  ExternalLink, 
  Bell, 
  BellRing,
  Filter,
  Check,
  Calendar
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TaskItem } from '../../types';

export const TasksView: React.FC = () => {
  const { 
    tasks, 
    notes, 
    projects, 
    createTask, 
    toggleTask, 
    deleteTask, 
    setSelectedNoteId, 
    setActiveView 
  } = useApp();

  const [filterMode, setFilterMode] = useState<'all' | 'pending' | 'completed'>('pending');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<TaskItem['priority']>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newProjectId, setNewProjectId] = useState('');

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (typeof Notification !== 'undefined') {
      const res = await Notification.requestPermission();
      setNotificationPermission(res);
      if (res === 'granted') {
        new Notification('EnderNote Reminders Active', {
          body: 'Browser notifications configured for voice-note action items.',
        });
      }
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    await createTask({
      title: newTitle.trim(),
      completed: false,
      priority: newPriority,
      dueDate: newDueDate || undefined,
      projectId: newProjectId || undefined,
      reminderEnabled: notificationPermission === 'granted',
    });

    setNewTitle('');
    setNewDueDate('');
  };

  const filteredTasks = tasks.filter(t => {
    if (filterMode === 'pending' && t.completed) return false;
    if (filterMode === 'completed' && !t.completed) return false;
    if (selectedProjectId !== 'all' && t.projectId !== selectedProjectId) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Tasks & Reminders
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
              {tasks.filter(t => !t.completed).length} open
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Action items and commitments extracted automatically from spoken recordings
          </p>
        </div>

        {/* Browser reminder trigger */}
        {notificationPermission !== 'granted' && (
          <button
            onClick={requestNotificationPermission}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-medium hover:bg-stone-300 transition-colors"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <span>Enable Browser Reminders</span>
          </button>
        )}
      </div>

      {/* Quick Add Task Input Card */}
      <form
        onSubmit={handleCreateTask}
        className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs space-y-3"
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add new task or action item..."
            className="flex-1 px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold shadow-xs flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Task</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Due date */}
          <div className="flex items-center gap-1 text-stone-500">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="px-2 py-1 text-xs rounded-md bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 focus:outline-hidden"
            />
          </div>

          {/* Priority */}
          <div className="flex items-center gap-1.5 text-stone-500">
            <span>Priority:</span>
            {(['low', 'medium', 'high'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setNewPriority(p)}
                className={`px-2 py-0.5 rounded text-[11px] capitalize transition-colors cursor-pointer ${
                  newPriority === p
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 font-bold shadow-2xs'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Project */}
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
          >
            <option value="">No Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </form>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-900 rounded-lg">
          {[
            { id: 'pending', label: 'Open Tasks' },
            { id: 'completed', label: 'Completed' },
            { id: 'all', label: 'All Tasks' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id as any)}
              className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                filterMode === f.id
                  ? 'bg-white dark:bg-stone-800 text-stone-950 dark:text-stone-50 shadow-xs'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-300/40 dark:hover:bg-stone-800/60'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-200 hover:border-stone-300 dark:hover:border-stone-600 focus:outline-hidden focus:ring-1 focus:ring-amber-500/50 transition-colors cursor-pointer"
        >
          <option value="all">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Task List */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 divide-y divide-stone-100 dark:divide-stone-800 overflow-hidden shadow-xs">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-stone-400 space-y-1">
            <CheckSquare className="w-8 h-8 text-stone-300 dark:text-stone-700 mx-auto mb-2" />
            <div>No tasks in this view</div>
          </div>
        ) : (
          filteredTasks.map(task => {
            const linkedNote = task.noteId ? notes.find(n => n.id === task.noteId) : undefined;
            const project = task.projectId ? projects.find(p => p.id === task.projectId) : undefined;

            return (
              <div
                key={task.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors group"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="w-10 h-10 -ml-2 -my-2 flex items-center justify-center shrink-0 cursor-pointer"
                    aria-label={task.completed ? "Mark task incomplete" : "Mark task complete"}
                  >
                    <span className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-colors ${
                      task.completed
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-stone-400 dark:border-stone-600 hover:border-stone-900 dark:hover:border-stone-400'
                    }`}>
                      {task.completed && <Check className="w-3 h-3 stroke-[2.5]" />}
                    </span>
                  </button>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${task.priority === 'high' ? 'bg-rose-500' : task.priority === 'low' ? 'bg-stone-400' : 'bg-amber-500'}`} />
                      <span className={`text-xs font-medium text-stone-900 dark:text-stone-100 ${task.completed ? 'line-through text-stone-400 dark:text-stone-500' : ''}`}>
                        {task.title}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-400">
                      {project && (
                        <span className="flex items-center gap-1 text-stone-600 dark:text-stone-300 font-medium">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: project.color }} />
                          <span>{project.name}</span>
                        </span>
                      )}

                      {task.dueDate && (
                        <span className="flex items-center gap-1 font-mono text-stone-500">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Due {task.dueDate}</span>
                        </span>
                      )}

                      {linkedNote && (
                        <button
                          onClick={() => {
                            setSelectedNoteId(linkedNote.id);
                            setActiveView('note_detail');
                          }}
                          className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          <span>Note: {linkedNote.title}</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="p-2 -mr-1 text-stone-300 dark:text-stone-600 hover:text-rose-500 dark:hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                  aria-label="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
