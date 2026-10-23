/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { FloatingActionGroup } from './components/layout/FloatingActionGroup';
import { AudioPlayerBar } from './components/player/AudioPlayerBar';
import { AskNotesChatbot } from './components/chat/AskNotesChatbot';
import { RecordModal } from './components/recording/RecordModal';
import { AboutModal } from './components/views/AboutModal';
import { MiniCapsule } from './components/common/MiniCapsule';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Views
import { DashboardView } from './components/views/DashboardView';
import { InboxView } from './components/views/InboxView';
import { NotesListView } from './components/views/NotesListView';
import { NoteDetailView } from './components/views/NoteDetailView';
import { ProjectsView } from './components/views/ProjectsView';
import { TasksView } from './components/views/TasksView';
import { AudioLibraryView } from './components/views/AudioLibraryView';
import { KnowledgeGraphView } from './components/views/KnowledgeGraphView';
import { ArchiveView } from './components/views/ArchiveView';
import { DeviceSyncView } from './components/views/DeviceSyncView';
import { SettingsView } from './components/views/SettingsView';

const MainContent: React.FC = () => {
  const { activeView, isLoading, player } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 1024;
    }
    return true;
  });
  const [askNotesModalOpen, setAskNotesModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const aboutTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isPlayerActive = Boolean(player.currentRecording);

  const renderActiveView = () => {
    switch (activeView) {
      case 'home':
        return (
          <DashboardView 
            onOpenAskNotes={() => setAskNotesModalOpen(true)} 
            onOpenRecordModal={() => setRecordModalOpen(true)}
          />
        );
      case 'inbox':
        return <InboxView />;
      case 'notes':
        return <NotesListView onOpenRecordModal={() => setRecordModalOpen(true)} />;
      case 'note_detail':
        return <NoteDetailView />;
      case 'projects':
        return <ProjectsView />;
      case 'tasks':
        return <TasksView />;
      case 'audio_library':
        return <AudioLibraryView onOpenRecordModal={() => setRecordModalOpen(true)} />;
      case 'knowledge_graph':
        return <KnowledgeGraphView />;
      case 'archive':
        return <ArchiveView />;
      case 'device_sync':
        return <DeviceSyncView />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <DashboardView 
            onOpenAskNotes={() => setAskNotesModalOpen(true)} 
            onOpenRecordModal={() => setRecordModalOpen(true)}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950 text-stone-500 text-xs">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-stone-300 dark:border-stone-700 border-t-amber-500 animate-spin" />
          <span>Opening local voice notes library...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans transition-colors">
      {/* Sidebar navigation */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenAbout={() => setAboutModalOpen(true)}
        aboutTriggerRef={aboutTriggerRef}
      />

      {/* Main page layout shifted right for fixed sidebar on lg screens when open */}
      <div className={`flex flex-col flex-1 min-w-0 transition-[padding] duration-200 ${sidebarOpen ? 'lg:pl-64' : 'pl-0'}`}>
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />

        <main className={`flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto ${isPlayerActive ? 'pb-48 sm:pb-44 lg:pb-24' : 'pb-28 sm:pb-28 lg:pb-8'}`}>
          <ErrorBoundary fallbackMessage="Unable to display this view.">
            {renderActiveView()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile-First Bottom Navigation Bar (visible on < lg screens) */}
      <BottomNav
        onOpenSidebar={() => setSidebarOpen(true)}
        isPlayerActive={isPlayerActive}
      />

      {/* Permanent Floating Action Group: [ Record Voice ] [ Ask My Notes ] */}
      <FloatingActionGroup
        onOpenAskNotes={() => setAskNotesModalOpen(true)}
        onOpenRecordModal={() => setRecordModalOpen(true)}
        isPlayerActive={isPlayerActive}
        isModalOpen={recordModalOpen || aboutModalOpen}
        isChatOpen={askNotesModalOpen}
      />

      {/* Floating persistent audio player */}
      <ErrorBoundary fallbackMessage="Audio player temporarily unavailable.">
        <AudioPlayerBar sidebarOpen={sidebarOpen} />
      </ErrorBoundary>

      {/* In-App Live Voice Recording & AI Studio Modal */}
      <RecordModal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
      />

      {/* Floating Ask My Notes AI Chatbot */}
      <AskNotesChatbot
        isOpen={askNotesModalOpen}
        onClose={() => setAskNotesModalOpen(false)}
        isPlayerActive={isPlayerActive}
      />

      {/* Centered About EnderNote Modal */}
      <AboutModal
        isOpen={aboutModalOpen}
        onClose={() => setAboutModalOpen(false)}
        triggerRef={aboutTriggerRef}
      />

      {/* Mini-Capsule Bottom Popup */}
      <MiniCapsule />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
