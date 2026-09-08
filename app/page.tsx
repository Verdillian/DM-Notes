"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  X,
  Star,
  ChevronDown,
  ChevronRight,
  Menu,
  Settings,
  Send,
  Search,
  Paperclip,
  HelpCircle,
  Calendar as CalendarIcon,
  Pencil,
  FolderInput,
  Command,
  Trash2,
  Link2,
  Pin,
  Bell,
  CheckSquare,
  Check,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import FormattingHelp from "@/components/FormattingHelp";
import ConfirmDialog from "@/components/ConfirmDialog";
import QuickSwitcher from "@/components/QuickSwitcher";
import TrashPanel, { type TrashedNote } from "@/components/TrashPanel";
import CreateEventDialog from "@/components/CreateEventDialog";
import { extractTags, toPlainText } from "@/lib/markdown";
import { loadPendingQueue, savePendingQueue, type PendingNote } from "@/lib/pendingQueue";

function snippet(content: string, maxLen = 60): string {
  const text = toPlainText(content);
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

type Note = {
  id: string;
  content: string;
  starred: boolean;
  threadId: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

type Thread = {
  id: string;
  name: string;
  createdAt: number;
  pinned: boolean;
};

type CurrentUser = {
  id: string;
  email: string;
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} · ${time}`;
}

function isCoarsePointer(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [addingThread, setAddingThread] = useState(false);
  const [newThreadName, setNewThreadName] = useState("");
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingNoteId, setMovingNoteId] = useState<string | null>(null);
  const [backlinksOpenId, setBacklinksOpenId] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<Note | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [quickSwitchOpen, setQuickSwitchOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashNotes, setTrashNotes] = useState<TrashedNote[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  function requestConfirm(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [linkQuery, setLinkQuery] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [linkSelIndex, setLinkSelIndex] = useState(0);
  const [uploading, setUploading] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadApp() {
      setLoadError(null);
      try {
        const meRes = await fetch("/api/auth/me");
        if (cancelled) return;
        if (!meRes.ok) {
          router.push("/login");
          return;
        }
        const me: CurrentUser = await meRes.json();
        if (cancelled) return;
        setUser(me);
        setCheckingAuth(false);
        setPendingNotes(loadPendingQueue(me.id));

        const [threadsRes, notesRes] = await Promise.all([
          fetch("/api/threads"),
          fetch("/api/notes"),
        ]);
        if (cancelled) return;
        if (!threadsRes.ok || !notesRes.ok) throw new Error();
        const threadsData: Thread[] = await threadsRes.json();
        const notesData: Note[] = await notesRes.json();
        if (cancelled) return;
        setThreads(threadsData);
        setNotes(notesData);
        if (threadsData.length > 0) setActiveThreadId(threadsData[0].id);
        setLoading(false);
      } catch {
        if (!cancelled) setLoadError(CONNECTION_ERROR);
      }
    }

    loadApp();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const isSearching = search.trim().length > 0;

  const currentThreadNotes = useMemo(
    () => notes.filter((n) => n.threadId === activeThreadId),
    [notes, activeThreadId]
  );

  const scopeNotes = isSearching ? notes : currentThreadNotes;

  const scopedTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of scopeNotes) for (const t of extractTags(n.content)) set.add(t);
    return [...set].sort();
  }, [scopeNotes]);

  const filteredNotes = useMemo(() => {
    return scopeNotes.filter((n) => {
      if (activeTag && !extractTags(n.content).includes(activeTag)) return false;
      if (search && !n.content.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [scopeNotes, search, activeTag]);

  const pinnedNotes = useMemo(
    () => currentThreadNotes.filter((n) => n.starred),
    [currentThreadNotes]
  );

  const threadsById = useMemo(() => {
    const map = new Map<string, Thread>();
    for (const t of threads) map.set(t.id, t);
    return map;
  }, [threads]);

  const backlinksByNoteId = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) {
      const seenTargets = new Set<string>();
      for (const match of note.content.matchAll(/\[\[([0-9a-fA-F-]{36})\|[^\]]+\]\]/g)) {
        const targetId = match[1];
        if (targetId === note.id || seenTargets.has(targetId)) continue;
        seenTargets.add(targetId);
        const list = map.get(targetId);
        if (list) list.push(note);
        else map.set(targetId, [note]);
      }
    }
    return map;
  }, [notes]);

  const visiblePendingNotes = useMemo(
    () => (isSearching ? [] : pendingNotes.filter((p) => p.threadId === activeThreadId)),
    [pendingNotes, activeThreadId, isSearching]
  );

  const switcherNotes = useMemo(
    () =>
      notes.map((n) => ({
        id: n.id,
        label: snippet(n.content, 70),
        threadName: threadsById.get(n.threadId)?.name ?? "?",
      })),
    [notes, threadsById]
  );

  const linkSuggestions = useMemo(() => {
    if (!linkQuery) return [];
    const q = linkQuery.query.toLowerCase();
    return notes
      .filter((n) => n.content.toLowerCase().includes(q))
      .slice(-50)
      .reverse()
      .slice(0, 5);
  }, [linkQuery, notes]);

  useEffect(() => {
    if (!isSearching) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [currentThreadNotes.length, activeThreadId, isSearching]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuickSwitchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function showError(message: string) {
    setToast(message);
  }

  const CONNECTION_ERROR = "Couldn't reach the server — check your connection and try again.";

  async function submitNote() {
    const content = draft.trim();
    if (!content || !activeThreadId) return;
    const threadId = activeThreadId;
    setDraft("");
    setLinkQuery(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, threadId }),
      });
      if (!res.ok) throw new Error();
      const note = await res.json();
      setNotes((prev) => [...prev, note]);
    } catch {
      // eslint-disable-next-line react-hooks/purity -- only ever reached from a user-triggered submit, never during render
      queueOfflineNote(content, threadId, Date.now());
    }
  }

  function queueOfflineNote(content: string, threadId: string, createdAt: number) {
    if (!user) return;
    const pending: PendingNote = {
      localId: crypto.randomUUID(),
      content,
      threadId,
      createdAt,
    };
    setPendingNotes((prev) => {
      const next = [...prev, pending];
      savePendingQueue(user.id, next);
      return next;
    });
    showError("You're offline — this note will send once you're back online.");
  }

  async function flushPendingQueue(queue: PendingNote[]) {
    if (!user || queue.length === 0) return;
    for (const p of queue) {
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: p.content, threadId: p.threadId }),
        });
        if (!res.ok) throw new Error();
        const note = await res.json();
        setNotes((prev) => [...prev, note]);
        setPendingNotes((prev) => {
          const next = prev.filter((x) => x.localId !== p.localId);
          savePendingQueue(user.id, next);
          return next;
        });
      } catch {
        break;
      }
    }
  }

  function discardPendingNote(localId: string) {
    if (!user) return;
    setPendingNotes((prev) => {
      const next = prev.filter((p) => p.localId !== localId);
      savePendingQueue(user.id, next);
      return next;
    });
  }

  useEffect(() => {
    function handleOnline() {
      flushPendingQueue(pendingNotes);
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotes]);

  useEffect(() => {
    if (pendingNotes.length === 0) return;
    const timer = setInterval(() => flushPendingQueue(pendingNotes), 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNotes]);

  async function patchNote(
    id: string,
    updates: Partial<Pick<Note, "content" | "starred" | "threadId">>
  ) {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    } catch {
      showError(CONNECTION_ERROR);
    }
  }

  function startEditNote(note: Note) {
    setMovingNoteId(null);
    setEditingNoteId(note.id);
    setEditingContent(note.content);
  }

  function cancelEditNote() {
    setEditingNoteId(null);
    setEditingContent("");
  }

  async function submitEditNote(id: string) {
    const content = editingContent.trim();
    const current = notes.find((n) => n.id === id);
    if (!content || !current) {
      cancelEditNote();
      return;
    }
    if (content === current.content) {
      cancelEditNote();
      return;
    }
    setEditingNoteId(null);
    await patchNote(id, { content });
  }

  function removeNote(id: string) {
    requestConfirm("Delete this note? You can restore it from Trash for 30 days.", () =>
      confirmRemoveNote(id)
    );
  }

  async function confirmRemoveNote(id: string) {
    const previous = notes;
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setNotes(previous);
      showError(CONNECTION_ERROR);
    }
  }

  function toggleNoteSelected(id: string) {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedNoteIds(new Set());
    setBulkMoveOpen(false);
  }

  function bulkDeleteSelected() {
    const count = selectedNoteIds.size;
    if (count === 0) return;
    requestConfirm(
      `Delete ${count} note${count === 1 ? "" : "s"}? You can restore them from Trash for 30 days.`,
      confirmBulkDeleteSelected
    );
  }

  async function confirmBulkDeleteSelected() {
    const ids = [...selectedNoteIds];
    const previous = notes;
    setBulkBusy(true);
    setNotes((prev) => prev.filter((n) => !selectedNoteIds.has(n.id)));
    try {
      const results = await Promise.all(
        ids.map((id) => fetch(`/api/notes/${id}`, { method: "DELETE" }))
      );
      if (results.some((r) => !r.ok)) throw new Error();
      exitSelectMode();
    } catch {
      setNotes(previous);
      showError(CONNECTION_ERROR);
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkMoveSelectedTo(threadId: string) {
    const ids = [...selectedNoteIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    setBulkMoveOpen(false);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/notes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ threadId }),
          })
        )
      );
      if (results.some((r) => !r.ok)) throw new Error();
      const updated: Note[] = await Promise.all(results.map((r) => r.json()));
      setNotes((prev) => {
        const updatedById = new Map(updated.map((n) => [n.id, n]));
        return prev.map((n) => updatedById.get(n.id) ?? n);
      });
      exitSelectMode();
    } catch {
      showError(CONNECTION_ERROR);
    } finally {
      setBulkBusy(false);
    }
  }

  async function openTrash() {
    setTrashOpen(true);
    setTrashLoading(true);
    try {
      const res = await fetch("/api/notes/trash");
      if (!res.ok) throw new Error();
      const trashed: Note[] = await res.json();
      setTrashNotes(
        trashed.map((n) => ({
          id: n.id,
          content: n.content,
          threadName: threadsById.get(n.threadId)?.name ?? "?",
          deletedAt: n.deletedAt ?? Date.now(),
        }))
      );
    } catch {
      showError(CONNECTION_ERROR);
    } finally {
      setTrashLoading(false);
    }
  }

  async function restoreTrashedNote(id: string) {
    const previous = trashNotes;
    setTrashNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch(`/api/notes/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error();
      const note: Note = await res.json();
      setNotes((prev) => [...prev, note].sort((a, b) => a.createdAt - b.createdAt));
    } catch {
      setTrashNotes(previous);
      showError(CONNECTION_ERROR);
    }
  }

  function deleteTrashedNoteForever(id: string) {
    requestConfirm("Permanently delete this note? This can't be undone.", () =>
      confirmDeleteTrashedNoteForever(id)
    );
  }

  async function confirmDeleteTrashedNoteForever(id: string) {
    const previous = trashNotes;
    setTrashNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      const res = await fetch(`/api/notes/${id}/permanent`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTrashNotes(previous);
      showError(CONNECTION_ERROR);
    }
  }

  async function createThread() {
    const name = newThreadName.trim();
    if (!name) {
      setAddingThread(false);
      return;
    }
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const thread = await res.json();
      setThreads((prev) => [...prev, thread]);
      setActiveThreadId(thread.id);
      setNewThreadName("");
      setAddingThread(false);
    } catch {
      showError(CONNECTION_ERROR);
    }
  }

  function startRenameThread(t: Thread) {
    setRenamingThreadId(t.id);
    setRenameValue(t.name);
  }

  async function submitRenameThread(id: string) {
    const name = renameValue.trim();
    setRenamingThreadId(null);
    const current = threadsById.get(id);
    if (!name || !current || name === current.name) return;
    try {
      const res = await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setThreads((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      showError(CONNECTION_ERROR);
    }
  }

  async function toggleThreadPinned(t: Thread) {
    try {
      const res = await fetch(`/api/threads/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !t.pinned }),
      });
      if (!res.ok) throw new Error();
      const updated: Thread = await res.json();
      setThreads((prev) =>
        prev
          .map((th) => (th.id === updated.id ? updated : th))
          .sort((a, b) =>
            a.pinned === b.pinned ? a.createdAt - b.createdAt : a.pinned ? -1 : 1
          )
      );
    } catch {
      showError(CONNECTION_ERROR);
    }
  }

  function deleteThread(id: string) {
    if (threads.length <= 1) return;
    const thread = threadsById.get(id);
    requestConfirm(
      `Delete "${thread?.name}" and all its notes? This can't be undone.`,
      () => confirmDeleteThread(id)
    );
  }

  async function confirmDeleteThread(id: string) {
    try {
      const res = await fetch(`/api/threads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const remaining = threads.filter((t) => t.id !== id);
      setThreads(remaining);
      setNotes((prev) => prev.filter((n) => n.threadId !== id));
      if (activeThreadId === id) setActiveThreadId(remaining[0]?.id ?? null);
    } catch {
      showError(CONNECTION_ERROR);
    }
  }

  function selectThread(id: string) {
    setActiveThreadId(id);
    setSearch("");
    setActiveTag(null);
    setSidebarOpen(false);
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) {
      setDraft((d) => d + text);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + text + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      const pos = start + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  type UploadResult = { url: string; isImage: boolean; name: string; size: number };

  async function uploadFile(file: File): Promise<UploadResult | null> {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showError(data.error ?? "Upload failed");
        return null;
      }
      return (await res.json()) as UploadResult;
    } catch {
      showError(CONNECTION_ERROR);
      return null;
    } finally {
      setUploading(false);
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function markdownForUpload(result: UploadResult): string {
    if (result.isImage) return `![](${result.url}) `;
    const withName = `${result.url}?name=${encodeURIComponent(result.name)}`;
    return `[📎 ${result.name} (${formatFileSize(result.size)})](${withName}) `;
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const result = await uploadFile(file);
    if (result) insertAtCursor(markdownForUpload(result));
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/")
    );
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    const result = await uploadFile(file);
    if (result) insertAtCursor(markdownForUpload(result));
  }

  function updateLinkQueryFromCaret(value: string, caret: number) {
    const before = value.slice(0, caret);
    const start = before.lastIndexOf("[[");
    if (start === -1) {
      setLinkQuery(null);
      return;
    }
    const between = before.slice(start + 2);
    if (between.includes("]]") || between.includes("\n")) {
      setLinkQuery(null);
      return;
    }
    setLinkQuery({ start, query: between });
    setLinkSelIndex(0);
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setDraft(value);
    updateLinkQueryFromCaret(value, e.target.selectionStart ?? value.length);
  }

  function selectLinkSuggestion(note: Note) {
    if (!linkQuery || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart ?? draft.length;
    const before = draft.slice(0, linkQuery.start);
    const after = draft.slice(caret);
    const label = snippet(note.content, 30);
    const inserted = `[[${note.id}|${label}]] `;
    const next = before + inserted + after;
    setDraft(next);
    setLinkQuery(null);
    requestAnimationFrame(() => {
      const pos = before.length + inserted.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (linkQuery && linkSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setLinkSelIndex((i) => (i + 1) % linkSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setLinkSelIndex(
          (i) => (i - 1 + linkSuggestions.length) % linkSuggestions.length
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        selectLinkSuggestion(linkSuggestions[linkSelIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setLinkQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
      e.preventDefault();
      submitNote();
    }
  }

  function jumpToNote(id: string) {
    const target = notes.find((n) => n.id === id);
    if (!target) return;
    setSearch("");
    setActiveTag(null);
    setActiveThreadId(target.threadId);
    setHighlightedId(id);
    requestAnimationFrame(() => {
      noteRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setHighlightedId(null), 1800);
  }

  const activeThread = activeThreadId ? threadsById.get(activeThreadId) : undefined;

  if (loadError) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-neutral-50 dark:bg-neutral-950 px-4">
        <p className="text-sm text-neutral-500 text-center">{loadError}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-md bg-brand-600 text-[var(--on-accent)] px-4 py-2 text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  if (checkingAuth || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <p className="text-sm text-neutral-400">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 overflow-hidden">
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 sm:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 flex flex-col transform transition-transform duration-200 sm:static sm:z-auto sm:w-56 sm:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-3 pt-3 pb-2 border-b border-neutral-200 dark:border-neutral-800">
          <p className="text-xs font-display text-brand-600 leading-relaxed">DM NOTES</p>
        </div>
        <div className="px-3 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-500">Threads</span>
          <button
            onClick={() => setAddingThread(true)}
            className="p-2 -m-1 rounded-md text-neutral-400 hover:text-brand-600 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            title="New thread"
          >
            <Plus size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pt-2 space-y-0.5">
          {threads.map((t) => {
            const count = notes.filter((n) => n.threadId === t.id).length;
            if (renamingThreadId === t.id) {
              return (
                <input
                  key={t.id}
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRenameThread(t.id);
                    if (e.key === "Escape") setRenamingThreadId(null);
                  }}
                  onBlur={() => submitRenameThread(t.id)}
                  className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-brand-400 bg-white dark:bg-neutral-900 focus:outline-none"
                />
              );
            }
            return (
              <div
                key={t.id}
                className={`group flex items-center rounded-lg ${
                  activeThreadId === t.id && !isSearching
                    ? "bg-brand-100 dark:bg-brand-900 shadow-[var(--active-thread-glow)]"
                    : "hover:bg-neutral-100 dark:hover:bg-neutral-900"
                }`}
              >
                <button
                  onClick={() => selectThread(t.id)}
                  onDoubleClick={() => startRenameThread(t)}
                  className="flex-1 text-left px-2.5 py-2 sm:py-1.5 text-sm truncate"
                >
                  {t.name}
                  <span className="ml-1.5 text-xs text-neutral-400">{count}</span>
                </button>
                <button
                  onClick={() => toggleThreadPinned(t)}
                  className={
                    t.pinned
                      ? "p-2.5 -m-1 text-gold-500"
                      : "p-2.5 -m-1 text-neutral-300 hover:text-gold-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  }
                  title={t.pinned ? "Unpin thread" : "Pin thread to top"}
                >
                  <Pin size={13} fill={t.pinned ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => startRenameThread(t)}
                  className="p-2.5 -m-1 text-neutral-300 hover:text-brand-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  title="Rename thread"
                >
                  <Pencil size={13} />
                </button>
                {threads.length > 1 && (
                  <button
                    onClick={() => deleteThread(t.id)}
                    className="p-2.5 -m-1 mr-1 text-neutral-300 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    title="Delete thread"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            );
          })}
          {addingThread && (
            <input
              autoFocus
              value={newThreadName}
              onChange={(e) => setNewThreadName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createThread();
                if (e.key === "Escape") {
                  setAddingThread(false);
                  setNewThreadName("");
                }
              }}
              onBlur={createThread}
              placeholder="Thread name…"
              className="w-full rounded-lg px-2.5 py-1.5 text-sm border border-brand-400 bg-white dark:bg-neutral-900 focus:outline-none"
            />
          )}
        </div>
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-2.5 space-y-1">
          <p className="px-1.5 pb-1 text-xs text-neutral-400 truncate" title={user.email}>
            {user.email}
          </p>
          <Link
            href="/calendar"
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <CalendarIcon size={16} />
            Calendar
          </Link>
          <button
            onClick={openTrash}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <Trash2 size={16} />
            Trash
          </button>
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            <Settings size={16} />
            Settings
          </Link>
          <p className="px-1.5 pt-1 text-[11px] text-neutral-300 dark:text-neutral-600">
            VERDILLIAN © 2026
          </p>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-neutral-200 dark:border-neutral-800 px-3 sm:px-4 py-2.5 sm:py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="sm:hidden p-1.5 -ml-1 rounded-md text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              aria-label="Open threads"
            >
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold truncate">
              {isSearching ? "Search results" : activeThread?.name ?? "Notes"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-initial">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
              />
              <input
                type="text"
                placeholder="Search all threads…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-8 pr-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => setQuickSwitchOpen(true)}
              className="hidden sm:flex items-center gap-1 rounded-md border border-neutral-200 dark:border-neutral-700 px-2 py-1.5 text-xs text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              title="Jump to a thread or note"
              aria-label="Jump to a thread or note"
            >
              <Command size={14} />
              <kbd className="font-sans">K</kbd>
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              className="p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              title="Formatting & shortcuts"
              aria-label="Formatting & shortcuts"
            >
              <HelpCircle size={18} />
            </button>
            <button
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedNoteIds(new Set());
              }}
              className={
                selectMode
                  ? "p-1.5 rounded-md text-brand-600 bg-brand-100 dark:bg-brand-900"
                  : "p-1.5 rounded-md text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
              }
              title={selectMode ? "Exit select mode" : "Select multiple notes"}
              aria-label={selectMode ? "Exit select mode" : "Select multiple notes"}
            >
              <CheckSquare size={18} />
            </button>
          </div>
        </header>

        {helpOpen && <FormattingHelp onClose={() => setHelpOpen(false)} />}

        {scopedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 sm:px-4 py-2 border-b border-neutral-200 dark:border-neutral-800">
            {scopedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag((t) => (t === tag ? null : tag))}
                className={`text-xs rounded-full px-2.5 py-1 border ${
                  activeTag === tag
                    ? "bg-brand-600 text-[var(--on-accent)] border-brand-600"
                    : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {!isSearching && pinnedNotes.length > 0 && (
          <div className="border-b border-neutral-200 dark:border-neutral-800">
            <button
              onClick={() => setPinnedOpen((v) => !v)}
              className="w-full text-left px-3 sm:px-4 py-1.5 text-xs font-medium text-gold-600 flex items-center gap-1"
            >
              {pinnedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Star size={12} fill="currentColor" />
              {pinnedNotes.length} pinned
            </button>
            {pinnedOpen && (
              <div className="px-3 sm:px-4 pb-2 space-y-1">
                {pinnedNotes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => jumpToNote(n.id)}
                    className="block w-full text-left text-xs truncate text-neutral-500 hover:text-brand-600"
                  >
                    {snippet(n.content, 90)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-3">
          {loading && (
            <p className="text-sm text-neutral-400 text-center mt-8">Loading…</p>
          )}
          {!loading && filteredNotes.length === 0 && (
            <p className="text-sm text-neutral-400 text-center mt-8">
              {currentThreadNotes.length === 0 && !isSearching
                ? "No notes yet — write your first one below."
                : "Nothing matches your filters."}
            </p>
          )}
          {filteredNotes.map((note) => (
            <div key={note.id} className="flex items-start gap-2 max-w-2xl self-start w-full">
              {selectMode && (
                <button
                  onClick={() => toggleNoteSelected(note.id)}
                  className="mt-3 shrink-0"
                  aria-label={selectedNoteIds.has(note.id) ? "Deselect note" : "Select note"}
                >
                  <span
                    className={
                      selectedNoteIds.has(note.id)
                        ? "flex h-5 w-5 items-center justify-center rounded-md bg-brand-600 text-[var(--on-accent)]"
                        : "flex h-5 w-5 items-center justify-center rounded-md border-2 border-neutral-300 dark:border-neutral-600"
                    }
                  >
                    {selectedNoteIds.has(note.id) && <Check size={13} />}
                  </span>
                </button>
              )}
            <div
              ref={(el) => {
                noteRefs.current[note.id] = el;
              }}
              className={`group relative min-w-0 flex-1 rounded-2xl rounded-tl-sm border px-4 py-2.5 shadow-[var(--bubble-shadow)] transition-colors ${
                highlightedId === note.id
                  ? "border-brand-500 bg-brand-50 dark:bg-brand-950"
                  : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              }`}
            >
              {isSearching && (
                <div className="mb-1 text-[11px] text-brand-600">
                  {threadsById.get(note.threadId)?.name ?? "?"}
                </div>
              )}
              {editingNoteId === note.id ? (
                <textarea
                  autoFocus
                  value={editingContent}
                  onChange={(e) => {
                    setEditingContent(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onFocus={(e) => {
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                    const len = e.target.value.length;
                    e.target.setSelectionRange(len, len);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditNote();
                    } else if (e.key === "Enter" && !e.shiftKey && !isCoarsePointer()) {
                      e.preventDefault();
                      submitEditNote(note.id);
                    }
                  }}
                  className="w-full resize-none rounded-lg border border-brand-400 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm font-sans focus:outline-none focus:ring-2 focus:ring-brand-500"
                  rows={1}
                />
              ) : (
                <Markdown
                  content={note.content}
                  onTagClick={(tag) => setActiveTag(tag)}
                  onLinkClick={jumpToNote}
                  onChangeContent={(newContent) =>
                    patchNote(note.id, { content: newContent })
                  }
                />
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="flex items-center gap-2 relative">
                  <span className="text-[11px] text-neutral-400">
                    {editingNoteId === note.id
                      ? "Enter to save · Shift+Enter for new line · Esc to cancel"
                      : formatTime(note.createdAt)}
                  </span>
                  {editingNoteId !== note.id &&
                    (backlinksByNoteId.get(note.id)?.length ?? 0) > 0 && (
                      <>
                        <button
                          onClick={() =>
                            setBacklinksOpenId(backlinksOpenId === note.id ? null : note.id)
                          }
                          className="flex items-center gap-0.5 text-[11px] text-neutral-400 hover:text-brand-600"
                          title="Notes linking here"
                        >
                          <Link2 size={11} />
                          {backlinksByNoteId.get(note.id)!.length}
                        </button>
                        {backlinksOpenId === note.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setBacklinksOpenId(null)}
                            />
                            <div className="absolute left-0 top-full mt-1 z-50 w-56 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
                              <p className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase text-neutral-400">
                                Linked from
                              </p>
                              {backlinksByNoteId.get(note.id)!.map((n) => (
                                <button
                                  key={n.id}
                                  onClick={() => {
                                    jumpToNote(n.id);
                                    setBacklinksOpenId(null);
                                  }}
                                  className="block w-full text-left px-3 py-2 text-xs truncate hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                >
                                  {snippet(n.content, 60)}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                </span>
                {editingNoteId === note.id ? (
                  <div className="flex items-center gap-1 -mr-2">
                    <button
                      onClick={cancelEditNote}
                      className="p-2.5 text-neutral-300 hover:text-red-500"
                      title="Cancel"
                    >
                      <X size={15} />
                    </button>
                    <button
                      onClick={() => submitEditNote(note.id)}
                      className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-brand-600 text-[var(--on-accent)] hover:bg-brand-700"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                <div className="relative flex items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity -mr-2">
                  <button
                    onClick={() => startEditNote(note)}
                    className="p-2.5 text-neutral-300 hover:text-brand-600"
                    title="Edit note"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setMovingNoteId(movingNoteId === note.id ? null : note.id)}
                    className="p-2.5 text-neutral-300 hover:text-brand-600"
                    title="Move to thread"
                  >
                    <FolderInput size={15} />
                  </button>
                  <button
                    onClick={() => setReminderNote(note)}
                    className="p-2.5 text-neutral-300 hover:text-brand-600"
                    title="Remind me about this"
                  >
                    <Bell size={15} />
                  </button>
                  <button
                    onClick={() => patchNote(note.id, { starred: !note.starred })}
                    className={
                      note.starred
                        ? "p-2.5 text-gold-500"
                        : "p-2.5 text-neutral-300 hover:text-gold-500"
                    }
                    title="Pin"
                  >
                    <Star size={15} fill={note.starred ? "currentColor" : "none"} />
                  </button>
                  <button
                    onClick={() => removeNote(note.id)}
                    className="p-2.5 text-neutral-300 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={15} />
                  </button>

                  {movingNoteId === note.id && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMovingNoteId(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
                        {threads
                          .filter((t) => t.id !== note.threadId)
                          .map((t) => (
                            <button
                              key={t.id}
                              onClick={() => {
                                patchNote(note.id, { threadId: t.id });
                                setMovingNoteId(null);
                              }}
                              className="block w-full text-left px-3 py-2 text-sm truncate hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            >
                              {t.name}
                            </button>
                          ))}
                        {threads.length <= 1 && (
                          <p className="px-3 py-2 text-xs text-neutral-400">
                            No other threads yet.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                )}
              </div>
            </div>
            </div>
          ))}
          {visiblePendingNotes.map((p) => (
            <div
              key={p.localId}
              className="max-w-2xl self-start w-full rounded-2xl rounded-tl-sm border border-dashed border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-2.5 opacity-70"
            >
              <p className="text-sm whitespace-pre-wrap break-words">{p.content}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">Waiting to reconnect…</span>
                <div className="flex items-center gap-1 -mr-2">
                  <button
                    onClick={() => discardPendingNote(p.localId)}
                    className="p-2.5 text-neutral-300 hover:text-red-500"
                    title="Discard"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </main>

        <footer className="relative border-t border-neutral-200 dark:border-neutral-800 p-2.5 sm:p-3">
          {selectMode ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-neutral-500">
                {selectedNoteIds.size} selected
              </span>
              <div className="relative flex items-center gap-2">
                <button
                  onClick={() => setBulkMoveOpen((v) => !v)}
                  disabled={selectedNoteIds.size === 0 || bulkBusy}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40"
                >
                  Move to…
                </button>
                {bulkMoveOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setBulkMoveOpen(false)} />
                    <div className="absolute bottom-full right-0 mb-1 z-50 w-44 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
                      {threads.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => bulkMoveSelectedTo(t.id)}
                          className="block w-full text-left px-3 py-2 text-sm truncate hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button
                  onClick={bulkDeleteSelected}
                  disabled={selectedNoteIds.size === 0 || bulkBusy}
                  className="rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40"
                >
                  Delete
                </button>
                <button
                  onClick={exitSelectMode}
                  className="rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
          {linkQuery && linkSuggestions.length > 0 && (
            <div className="absolute bottom-full left-2.5 right-2.5 sm:left-3 sm:right-3 mb-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
              {linkSuggestions.map((n, i) => (
                <button
                  key={n.id}
                  onClick={() => selectLinkSuggestion(n)}
                  className={`block w-full text-left px-3 py-2 text-sm truncate ${
                    i === linkSelIndex
                      ? "bg-brand-100 dark:bg-brand-900"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {snippet(n.content, 70)}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,.pdf,.txt,.csv,.json,.md,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              onChange={handleAttachFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center justify-center rounded-xl border border-neutral-300 dark:border-neutral-700 px-3 py-2.5 sm:py-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40"
              title="Attach image or file"
              aria-label="Attach image or file"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder='Write a note… **bold**, `code`, #tag, [[link]], - [ ] todo'
              rows={1}
              className="flex-1 resize-none overflow-y-auto rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-[50dvh]"
            />
            <button
              onClick={submitNote}
              disabled={!draft.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-[var(--on-accent)] px-3.5 py-2.5 sm:py-2 text-sm font-medium disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          {draft.trim().length > 0 && (
            <p className="mt-1 text-right text-[11px] text-neutral-400">
              {draft.trim().split(/\s+/).length} words · {draft.length} characters
            </p>
          )}
            </>
          )}
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] rounded-lg bg-neutral-900 dark:bg-neutral-100 text-neutral-50 dark:text-neutral-900 text-sm px-4 py-2.5 shadow-lg text-center">
          {toast}
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const { onConfirm } = confirmState;
            setConfirmState(null);
            onConfirm();
          }}
        />
      )}

      {quickSwitchOpen && (
        <QuickSwitcher
          threads={threads}
          notes={switcherNotes}
          onSelectThread={selectThread}
          onSelectNote={jumpToNote}
          onClose={() => setQuickSwitchOpen(false)}
        />
      )}

      {trashOpen && (
        <TrashPanel
          notes={trashNotes}
          loading={trashLoading}
          onRestore={restoreTrashedNote}
          onDeleteForever={deleteTrashedNoteForever}
          onClose={() => setTrashOpen(false)}
        />
      )}

      {reminderNote && (
        <CreateEventDialog
          defaultDay={new Date()}
          initialSummary={snippet(reminderNote.content, 100)}
          onClose={() => setReminderNote(null)}
          onCreated={() => {
            setReminderNote(null);
            showError("Reminder created.");
          }}
        />
      )}
    </div>
  );
}
