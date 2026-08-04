import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { useNotifications } from "../context/NotificationContext";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Users,
  X,
  Trash2,
  Lock,
  Bell,
  AlertTriangle
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  creatorId: string;
  attendees: string[]; // user IDs list
  color: string;
}

export const CalendarPage: React.FC = () => {
  const { user, serverUrl } = useAuth();
  const { socket } = useSocket();
  const { triggerCalendarNotification } = useNotifications();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  
  // Form fields
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [eventColor, setEventColor] = useState("#386a20"); // Default success-moss color
  
  // Available users list for attendees selection
  const [coworkers, setCoworkers] = useState<any[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all-cal");

  // Track event IDs that have already been notified
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

  // Check if current user has edit permission
  const canEdit = user?.role === "admin" || user?.canEditCalendar;

  const loadEvents = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/calendar`);
      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      }
    } catch (e) {
      console.error("Failed to load calendar events:", e);
    }
  };

  const loadCoworkers = async () => {
    try {
      const response = await fetch(`${serverUrl}/api/users`);
      if (response.ok) {
        const data = await response.json();
        setCoworkers(data.filter((u: any) => u.id !== user?.id && u.isDisabled !== 1));
      }
    } catch (e) {
      console.error("Failed to load coworkers:", e);
    }
  };

  useEffect(() => {
    loadEvents();
    loadCoworkers();
  }, []);

  // Listen to calendar socket events
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (evt: CalendarEvent) => {
      setEvents((prev) => [...prev, evt]);
    };

    const handleUpdated = (evt: CalendarEvent) => {
      setEvents((prev) => prev.map((e) => (e.id === evt.id ? evt : e)));
    };

    const handleDeleted = ({ eventId }: { eventId: string }) => {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    };

    socket.on("calendar_event_created", handleCreated);
    socket.on("calendar_event_updated", handleUpdated);
    socket.on("calendar_event_deleted", handleDeleted);

    return () => {
      socket.off("calendar_event_created", handleCreated);
      socket.off("calendar_event_updated", handleUpdated);
      socket.off("calendar_event_deleted", handleDeleted);
    };
  }, [socket]);

  // 30-minute event reminder — polls every 60 seconds (Triggers bottom-right toast & OS Push Notification)
  useEffect(() => {
    const checkUpcoming = () => {
      const now = new Date();
      for (const evt of events) {
        if (dismissedAlerts.has(evt.id)) continue;
        const startTime = new Date(evt.startTime);
        const diffMs = startTime.getTime() - now.getTime();
        const diffMin = diffMs / (1000 * 60);
        // Alert if event is between 0 and 30 minutes away
        if (diffMin > 0 && diffMin <= 30) {
          setDismissedAlerts((prev) => new Set(prev).add(evt.id));
          triggerCalendarNotification({
            id: evt.id,
            title: evt.title,
            description: evt.description,
            startTime: evt.startTime,
            endTime: evt.endTime
          });
        }
      }
    };

    checkUpcoming();
    const interval = setInterval(checkUpcoming, 60000); // Every 60 seconds
    return () => clearInterval(interval);
  }, [events, dismissedAlerts, triggerCalendarNotification]);

  const dismissAlert = () => {};

  // Calendar calculations
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay(); // 0 is Sunday, 6 is Saturday
  };

  const navigateMonth = (direction: "prev" | "next") => {
    const offset = direction === "prev" ? -1 : 1;
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1));
  };

  // Open creation modal
  const handleOpenAddModal = (date: Date) => {
    if (!canEdit) return;
    setActiveEvent(null);
    setEventTitle("");
    setEventDesc("");
    
    // format date as yyyy-MM-dd
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    setEventDate(`${yyyy}-${mm}-${dd}`);
    
    setEventStartTime("09:00");
    setEventEndTime("10:00");
    setEventColor("#386a20"); // success-moss
    setSelectedAttendees([]);
    setShowEventModal(true);
  };

  // Open edit modal
  const handleOpenEditModal = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    setActiveEvent(event);
    setEventTitle(event.title);
    setEventDesc(event.description || "");

    const startDate = new Date(event.startTime);
    const endDate = new Date(event.endTime);
    
    const yyyy = startDate.getFullYear();
    const mm = String(startDate.getMonth() + 1).padStart(2, "0");
    const dd = String(startDate.getDate()).padStart(2, "0");
    setEventDate(`${yyyy}-${mm}-${dd}`);
    
    const startHour = String(startDate.getHours()).padStart(2, "0");
    const startMin = String(startDate.getMinutes()).padStart(2, "0");
    setEventStartTime(`${startHour}:${startMin}`);

    const endHour = String(endDate.getHours()).padStart(2, "0");
    const endMin = String(endDate.getMinutes()).padStart(2, "0");
    setEventEndTime(`${endHour}:${endMin}`);

    setEventColor(event.color || "#386a20");
    setSelectedAttendees(event.attendees || []);
    setShowEventModal(true);
  };

  // Save Event handler
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !user) return;

    const startISO = new Date(`${eventDate}T${eventStartTime}`).toISOString();
    const endISO = new Date(`${eventDate}T${eventEndTime}`).toISOString();

    const payload = {
      title: eventTitle.trim(),
      description: eventDesc.trim() || null,
      startTime: startISO,
      endTime: endISO,
      creatorId: user.id,
      attendees: selectedAttendees,
      color: eventColor,
      userId: user.id // for auth checks on server
    };

    try {
      let url = `${serverUrl}/api/calendar`;
      let method = "POST";

      if (activeEvent) {
        url = `${serverUrl}/api/calendar/${activeEvent.id}`;
        method = "PUT";
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowEventModal(false);
      }
    } catch (e) {
      console.error("Failed to save event:", e);
    }
  };

  // Delete event handler
  const handleDeleteEvent = async () => {
    if (!activeEvent || !canEdit || !user) return;
    try {
      const response = await fetch(`${serverUrl}/api/calendar/${activeEvent.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id })
      });
      if (response.ok) {
        setShowEventModal(false);
      }
    } catch (e) {
      console.error("Failed to delete event:", e);
    }
  };

  const toggleAttendee = (userId: string) => {
    setSelectedAttendees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  // Render month grid helpers
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDayIndex = getFirstDayOfMonth(currentDate);
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Populate cells
  const calendarCells: (Date | null)[] = [];
  
  // Previous month padding
  const prevDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const prevDaysInMonth = getDaysInMonth(prevDate);
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    calendarCells.push(new Date(prevDate.getFullYear(), prevDate.getMonth(), prevDaysInMonth - i));
  }
  
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    calendarCells.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), i));
  }

  // Next month padding to fill rows
  const remaining = 35 - calendarCells.length;
  const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  if (remaining > 0) {
    for (let i = 1; i <= remaining; i++) {
      calendarCells.push(new Date(nextDate.getFullYear(), nextDate.getMonth(), i));
    }
  } else if (calendarCells.length > 35 && calendarCells.length < 42) {
    const rem = 42 - calendarCells.length;
    for (let i = 1; i <= rem; i++) {
      calendarCells.push(new Date(nextDate.getFullYear(), nextDate.getMonth(), i));
    }
  }

  // Filter events of a specific date cell
  const getEventsForDate = (date: Date | null) => {
    if (!date) return [];
    return events.filter((evt) => {
      const start = new Date(evt.startTime);
      return (
        start.getFullYear() === date.getFullYear() &&
        start.getMonth() === date.getMonth() &&
        start.getDate() === date.getDate()
      );
    });
  };

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isCurrentMonth = (date: Date | null) => {
    if (!date) return false;
    return date.getMonth() === currentDate.getMonth();
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-paper text-ink h-full">
      {/* 2. THE CHANNEL SIDEBAR (260px) */}
      <aside className="w-[260px] flex flex-col bg-sidebar-bone border-r border-line-hairline shrink-0 h-full">
        <div className="h-16 flex items-center px-6 border-b border-line-hairline shrink-0">
          <div>
            <h1 className="font-header-title text-header-title text-primary italic">Bureau Ledger</h1>
            <p className="font-label-caps text-[9px] text-ink-muted uppercase tracking-widest leading-none mt-1">
              Shared Calendars
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 px-2 space-y-1">
          <button
            onClick={() => setSelectedCategory("all-cal")}
            className={`w-full px-4 py-2 hover:bg-primary/5 transition-all text-left flex items-center justify-between font-ui-label text-ui-label ${
              selectedCategory === "all-cal" ? "text-primary font-bold border-r-2 border-primary bg-primary/5" : "text-ink-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="material-symbols-outlined text-sm">tag</span>
              <span># marketing-cal</span>
            </span>
            {selectedCategory === "all-cal" && <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>}
          </button>
          
          <button
            onClick={() => setSelectedCategory("roadmap")}
            className={`w-full px-4 py-2 hover:bg-primary/5 transition-all text-left flex items-center justify-between font-ui-label text-ui-label ${
              selectedCategory === "roadmap" ? "text-primary font-bold border-r-2 border-primary bg-primary/5" : "text-ink-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="material-symbols-outlined text-sm">tag</span>
              <span># project-roadmap</span>
            </span>
            {selectedCategory === "roadmap" && <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>}
          </button>

          <button
            onClick={() => setSelectedCategory("leave")}
            className={`w-full px-4 py-2 hover:bg-primary/5 transition-all text-left flex items-center justify-between font-ui-label text-ui-label ${
              selectedCategory === "leave" ? "text-primary font-bold border-r-2 border-primary bg-primary/5" : "text-ink-muted"
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="material-symbols-outlined text-sm">tag</span>
              <span># team-leave</span>
            </span>
            {selectedCategory === "leave" && <div className="w-2 h-2 rounded-full bg-primary shrink-0"></div>}
          </button>

          <div className="mt-8 px-4 pb-2">
            <p className="font-label-caps text-[10px] text-ink-muted uppercase tracking-[0.2em] font-bold">
              Collaborators
            </p>
          </div>

          {coworkers.map((cw) => (
            <div
              key={cw.id}
              className="px-4 py-2 text-ink-muted hover:bg-primary/5 transition-all flex items-center gap-3 text-xs"
            >
              <span
                className={`material-symbols-outlined text-sm shrink-0 ${
                  cw.status === "online" ? "text-success-moss" : "text-slate-400"
                }`}
                style={{ fontVariationSettings: cw.status === "online" ? "'FILL' 1" : "'FILL' 0" }}
              >
                circle
              </span>
              <span className="font-ui-label text-ui-label truncate">{cw.displayName}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full bg-paper min-w-0">
        {/* TOP APP BAR */}
        <header className="h-16 flex justify-between items-center px-gutter border-b border-line-hairline bg-paper shrink-0 z-30">
          <div className="flex items-center gap-4">
            <h2 className="font-header-title text-header-title italic text-ink">
              # {selectedCategory === "all-cal" ? "marketing-cal" : selectedCategory === "roadmap" ? "project-roadmap" : "team-leave"}
            </h2>
            <div className="h-4 w-[1px] bg-line-hairline mx-2"></div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-1.5 hover:bg-sidebar-bone rounded transition-colors text-ink-muted"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              
              <span className="font-header-title text-[15px] italic text-ink font-bold px-1 select-none min-w-[120px] text-center">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </span>

              <button
                onClick={() => navigateMonth("next")}
                className="p-1.5 hover:bg-sidebar-bone rounded transition-colors text-ink-muted"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-sidebar-bone p-1 rounded">
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1.5 font-ui-label text-caption text-ink-muted hover:text-primary transition-colors"
              >
                Today
              </button>
              <button className="px-3 py-1 font-ui-label text-caption text-primary bg-paper border border-line-hairline rounded shadow-sm">
                Month
              </button>
            </div>

            {canEdit && (
              <button
                onClick={() => handleOpenAddModal(selectedDate || new Date())}
                className="bg-primary-container text-on-primary-container px-4 py-2 rounded font-ui-label text-ui-label flex items-center gap-2 hover:bg-primary transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>New Event</span>
              </button>
            )}
          </div>
        </header>

        {/* CALENDAR MONTH GRID */}
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Day Names Row */}
          <div className="grid grid-cols-7 border-b border-line-hairline bg-sidebar-bone/30">
            {weekDays.map((day) => (
              <div key={day} className="py-3 text-center border-r border-line-hairline last:border-r-0">
                <span className="font-label-caps text-caption text-ink-muted uppercase tracking-wider">
                  {day}
                </span>
              </div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 grid-rows-5 flex-1 min-h-0 divide-x divide-y divide-line-hairline">
            {calendarCells.map((date, idx) => {
              const cellEvents = getEventsForDate(date);
              const isTodayCell = isToday(date);
              const isCurrMonth = isCurrentMonth(date);

              return (
                <div
                  key={idx}
                  onClick={() => date && setSelectedDate(date)}
                  onDoubleClick={() => date && handleOpenAddModal(date)}
                  className={`p-2 min-h-[110px] hover:bg-sidebar-bone/50 transition-colors group cursor-pointer relative overflow-hidden flex flex-col ${
                    isCurrMonth ? "bg-transparent" : "bg-surface-container-low opacity-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p
                      className={`font-ui-label text-caption ${
                        isTodayCell
                          ? "text-primary font-black bg-primary-container/20 w-6 h-6 flex items-center justify-center rounded-full"
                          : "text-ink-muted"
                      }`}
                    >
                      {date?.getDate()}
                    </p>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-1.5 mt-2 pr-1 custom-scrollbar">
                    {cellEvents.map((evt) => (
                      <div
                        key={evt.id}
                        onClick={(e) => handleOpenEditModal(e, evt)}
                        style={{ borderLeftColor: evt.color || "#386a20" }}
                        className="p-1 bg-white hover:bg-slate-50 transition-colors border-l-2 rounded-r shadow-xs text-left"
                      >
                        <p className="font-ui-label text-[10px] text-ink truncate leading-tight">
                          {evt.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* EVENT DETAILS / EDIT DRAWER (Right Pane overlay) */}
      {selectedDate && (
        <div className="w-[280px] border-l border-line-hairline bg-sidebar-bone flex flex-col shrink-0 h-full">
          <div className="h-16 flex items-center justify-between px-6 border-b border-line-hairline shrink-0">
            <h3 className="font-header-title text-sm italic text-ink">Schedule Records</h3>
            <span className="font-mono text-[10px] text-ink-muted">
              {selectedDate.getDate()} {monthNames[selectedDate.getMonth()]}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <p className="font-label-caps text-[10px] text-ink-muted uppercase tracking-wider font-bold mb-2">
              Scheduled Items ({getEventsForDate(selectedDate).length})
            </p>

            {getEventsForDate(selectedDate).map((evt) => {
              const start = new Date(evt.startTime);
              const end = new Date(evt.endTime);
              const timeString = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " - " + end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              return (
                <div
                  key={evt.id}
                  onClick={(e) => handleOpenEditModal(e, evt)}
                  className="p-3 bg-white hover:bg-slate-50 transition-all border border-line-hairline rounded shadow-xs cursor-pointer flex flex-col gap-1.5"
                >
                  <h4 className="font-bold text-[13px] text-ink leading-tight">{evt.title}</h4>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted">
                    <span className="material-symbols-outlined text-[12px]">schedule</span>
                    <span>{timeString}</span>
                  </div>
                  {evt.description && (
                    <p className="text-[11px] text-ink-muted leading-relaxed line-clamp-2">{evt.description}</p>
                  )}
                </div>
              );
            })}

            {getEventsForDate(selectedDate).length === 0 && (
              <div className="text-center py-10 text-ink-muted">
                <span className="material-symbols-outlined text-3xl opacity-30 block mb-1">
                  event_busy
                </span>
                <p className="font-ui-label text-caption italic">No events planned</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EVENT EDITOR / CREATOR DIALOG MODAL */}
      {showEventModal && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
            onClick={() => setShowEventModal(false)}
          ></div>
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-md w-full bg-paper border border-line-hairline shadow-2xl rounded-xl overflow-hidden z-50 animate-slide-in">
            <div className="bg-sidebar-bone p-6 border-b border-line-hairline flex justify-between items-start">
              <div>
                <p className="font-label-caps text-caption text-ink-muted uppercase tracking-widest mb-1">
                  Bureau Event
                </p>
                <h3 className="font-header-title text-display-xl serif-title text-primary italic">
                  {activeEvent ? "Edit Event" : "Create New Event"}
                </h3>
              </div>
              <button
                type="button"
                className="text-ink-muted hover:text-ink"
                onClick={() => setShowEventModal(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {!canEdit && (
              <div className="mx-6 mt-4 p-3 bg-error-container text-on-error-container rounded border border-error/20 text-xs font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">lock</span>
                <span>You are in view-only mode. Modification permissions are required.</span>
              </div>
            )}

            <form onSubmit={handleSaveEvent} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Social Media Briefing"
                  disabled={!canEdit}
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="font-ui-label text-ui-label text-ink-muted">Date</label>
                  <input
                    type="date"
                    required
                    disabled={!canEdit}
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full bg-paper border border-line-hairline rounded px-2.5 py-2 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-ui-label text-ui-label text-ink-muted">Start</label>
                  <input
                    type="time"
                    required
                    disabled={!canEdit}
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full bg-paper border border-line-hairline rounded px-2.5 py-2 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-ui-label text-ui-label text-ink-muted">End</label>
                  <input
                    type="time"
                    required
                    disabled={!canEdit}
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full bg-paper border border-line-hairline rounded px-2.5 py-2 font-ui-label text-ui-label focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Attendees</label>
                <div className="max-h-24 overflow-y-auto p-1.5 border border-line-hairline rounded bg-white flex flex-wrap gap-1">
                  {coworkers.map((cw) => {
                    const isChecked = selectedAttendees.includes(cw.id);
                    return (
                      <button
                        key={cw.id}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleAttendee(cw.id)}
                        className={`px-3 py-1 rounded border text-[10px] font-semibold transition-all ${
                          isChecked
                            ? "bg-primary/5 border-primary/30 text-primary font-bold"
                            : "bg-slate-50 border-line-hairline text-ink-muted hover:bg-slate-100"
                        }`}
                      >
                        {cw.displayName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-ui-label text-ui-label text-ink-muted">Notes</label>
                <textarea
                  placeholder="Event details, links or instructions..."
                  rows={2}
                  disabled={!canEdit}
                  value={eventDesc}
                  onChange={(e) => setEventDesc(e.target.value)}
                  className="w-full bg-paper border border-line-hairline rounded px-4 py-2.5 font-body-message text-body-message focus:ring-1 focus:ring-primary outline-none resize-none"
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                {/* Color labels */}
                <div className="flex items-center gap-2">
                  <span className="font-ui-label text-[10px] text-ink-muted">Color:</span>
                  <div className="flex gap-1">
                    {["#386a20", "#2d349f", "#4c53b8", "#ba1a1a", "#ca8a04"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setEventColor(c)}
                        style={{ backgroundColor: c }}
                        className={`w-4 h-4 rounded-full border border-line-hairline ${
                          eventColor === c ? "ring-2 ring-primary-container" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeEvent && canEdit && (
                    <button
                      type="button"
                      onClick={handleDeleteEvent}
                      className="p-2 bg-rose-50 hover:bg-rose-100/10 text-red-500 rounded border border-red-500/20"
                      title="Delete Event"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowEventModal(false)}
                    className="px-5 py-2 border border-line-hairline rounded font-ui-label text-ui-label text-ink hover:bg-sidebar-bone transition-colors"
                  >
                    Discard
                  </button>

                  {canEdit && (
                    <button
                      type="submit"
                      disabled={!eventTitle.trim()}
                      className="px-5 py-2 bg-primary text-on-primary rounded font-ui-label text-ui-label hover:bg-primary-container disabled:opacity-50 transition-colors shadow-sm"
                    >
                      Save Changes
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
export default CalendarPage;
