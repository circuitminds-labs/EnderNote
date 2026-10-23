import React, { useState } from 'react';
import { 
  FolderKanban, 
  Plus, 
  Trash2, 
  Edit3, 
  FileText, 
  ArrowRight,
  X,
  Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Project } from '../../types';

export const ProjectsView: React.FC = () => {
  const { 
    projects, 
    notes, 
    createProject, 
    updateProject, 
    deleteProject, 
    setSelectedNoteId, 
    setActiveView 
  } = useApp();

  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0]?.id || '');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0284c7');

  const colorPresets = [
    '#0284c7', // Sky
    '#7c3aed', // Violet
    '#059669', // Emerald
    '#ea580c', // Orange
    '#e11d48', // Rose
    '#ca8a04', // Amber
    '#4b5563', // Slate
  ];

  const handleOpenCreateModal = () => {
    setEditingProject(null);
    setName('');
    setDescription('');
    setColor(colorPresets[0]);
    setModalOpen(true);
  };

  const handleOpenEditModal = (p: Project) => {
    setEditingProject(p);
    setName(p.name);
    setDescription(p.description);
    setColor(p.color);
    setModalOpen(true);
  };

  const handleSaveProject = async () => {
    if (!name.trim()) return;

    if (editingProject) {
      await updateProject({
        ...editingProject,
        name: name.trim(),
        description: description.trim(),
        color,
      });
    } else {
      const created = await createProject({
        name: name.trim(),
        description: description.trim(),
        color,
      });
      setActiveProjectId(created.id);
    }

    setModalOpen(false);
  };

  const selectedProject = projects.find(p => p.id === activeProjectId);
  const projectNotes = notes.filter(n => !n.isArchived && n.projectId === activeProjectId);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-100">
              Projects & Knowledge Areas
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300 font-mono">
              {projects.length}
            </span>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Organize voice notes around long-term research goals, engineering topics, or classes
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-semibold transition-colors shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>
      </div>

      {/* 2-Column Layout: Left Project Cards / Right Project Notes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Project List */}
        <div className="space-y-3">
          {projects.map(p => {
            const count = notes.filter(n => !n.isArchived && n.projectId === p.id).length;
            const isSelected = p.id === activeProjectId;

            return (
              <div
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={`p-4 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white dark:bg-stone-900 border-stone-400 dark:border-stone-600 shadow-sm'
                    : 'bg-stone-50 dark:bg-stone-900/40 border-stone-200/80 dark:border-stone-800/80 hover:bg-stone-100/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <h3 className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                      {p.name}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditModal(p);
                      }}
                      className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                      title="Edit Project"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete project "${p.name}"? Notes will be moved to unassigned inbox.`)) {
                          deleteProject(p.id);
                        }
                      }}
                      className="p-1 text-stone-400 hover:text-rose-500"
                      title="Delete Project"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-stone-500 dark:text-stone-400 line-clamp-2 mt-2 leading-relaxed">
                  {p.description || 'No description provided.'}
                </p>

                <div className="text-[10px] text-stone-400 font-mono mt-3">
                  {count} note{count !== 1 ? 's' : ''} assigned
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Notes under selected project */}
        <div className="md:col-span-2 space-y-4">
          {selectedProject ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-4 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: selectedProject.color }} />
                  <div>
                    <h2 className="text-sm font-bold text-stone-900 dark:text-stone-100">
                      {selectedProject.name}
                    </h2>
                    <p className="text-xs text-stone-500">{selectedProject.description}</p>
                  </div>
                </div>

                <span className="text-xs font-mono text-stone-400">
                  {projectNotes.length} Note{projectNotes.length !== 1 ? 's' : ''}
                </span>
              </div>

              {projectNotes.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400 space-y-2">
                  <FileText className="w-8 h-8 text-stone-300 dark:text-stone-700 mx-auto" />
                  <p>No notes filed under this project yet.</p>
                  <p className="text-[11px]">Go to Inbox to organize new voice recordings into this project.</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-stone-800">
                  {projectNotes.map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setSelectedNoteId(n.id);
                        setActiveView('note_detail');
                      }}
                      className="py-3.5 flex items-center justify-between gap-4 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/40 rounded-lg px-2 transition-colors group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors truncate">
                            {n.title}
                          </h4>
                          <span className="text-[10px] text-stone-400 font-mono capitalize">
                            · {n.noteType}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate mt-0.5">
                          {n.summary}
                        </p>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-stone-400 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
              Select or create a project to view notes.
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Project Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                {editingProject ? 'Edit Project' : 'Create New Project'}
              </h3>
              <button 
                type="button" 
                onClick={() => setModalOpen(false)} 
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-stone-500">Project Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. ESP32 Hardware, AI Research"
                  className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-stone-500">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Goals, topics, and scope of this project..."
                  className="w-full px-3 py-2 text-xs rounded-lg bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:border-amber-500 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-stone-500">Color Tag</label>
                <div className="flex items-center gap-2">
                  {colorPresets.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-stone-900 dark:ring-stone-100 ring-offset-2' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveProject}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 shadow-xs"
              >
                Save Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
