import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Package, Calendar, CheckCircle2, AlertCircle, ChevronRight, ArrowLeft, Check, Sparkles, ClipboardCheck, Users, User, PartyPopper } from 'lucide-react';

// Predefined programs and their props
const PROGRAMS = [
  { 
    id: 'p1', 
    name: 'Крио-шоу', 
    props: ['Бананы', 'Научная скатерть', 'Азот', 'Термос', 'Специальный шлем'] 
  },
  { 
    id: 'p2', 
    name: 'Квест «Код успеха»', 
    props: ['Карточки с шифрами', 'Сундук', 'Маркеры', 'Элементы головоломок'] 
  },
  { 
    id: 'p3', 
    name: 'Программа «Монстр-Фест»', 
    props: ['Тематические костюмы', 'Слизь', 'Музыкальная колонка', 'Полоса препятствий'] 
  }
];

// App ID for scoped database paths
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tut-i-tam-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error", e);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [role, setRole] = useState('animator'); // 'animator' | 'manager'
  const [isLoading, setIsLoading] = useState(true);

  // View states for Animator
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, new_event, return_props
  const [selectedEventId, setSelectedEventId] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Strict path rule: /artifacts/{appId}/public/data/events
    const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
    
    const unsubscribe = onSnapshot(
      eventsRef, 
      (snapshot) => {
        const eventsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEvents(eventsData);
        setIsLoading(false);
      },
      (error) => {
        console.error("Firestore error:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Sorting events by creation date (descending) in memory to avoid complex query requirements
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return timeB - timeA;
    });
  }, [events]);

  const activeEvents = sortedEvents.filter(e => e.status === 'at_event');
  const completedEvents = sortedEvents.filter(e => e.status === 'completed');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="animate-pulse flex flex-col items-center">
          <Sparkles className="w-12 h-12 text-purple-500 mb-4 animate-spin-slow" />
          <p className="text-slate-500 font-medium">Загрузка базы реквизита...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* Top Navigation / Role Toggle */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-purple-100 p-2 rounded-xl">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <h1 className="font-bold text-lg text-slate-800 tracking-tight">Тут и там</h1>
          </div>
          
          <div className="bg-slate-100 p-1 rounded-lg flex text-sm font-medium">
            <button 
              onClick={() => { setRole('animator'); setCurrentView('dashboard'); }}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${role === 'animator' ? 'bg-white shadow-sm text-purple-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <User className="w-4 h-4" />
              <span>Сотрудник</span>
            </button>
            <button 
              onClick={() => { setRole('manager'); setCurrentView('dashboard'); }}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${role === 'manager' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Users className="w-4 h-4" />
              <span>Шеф</span>
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-md mx-auto p-4">
        {role === 'animator' && (
          <AnimatorFlow 
            events={activeEvents} 
            currentView={currentView}
            setCurrentView={setCurrentView}
            selectedEventId={selectedEventId}
            setSelectedEventId={setSelectedEventId}
            user={user}
          />
        )}

        {role === 'manager' && (
          <ManagerFlow events={sortedEvents} />
        )}
      </main>
    </div>
  );
}

function AnimatorFlow({ events, currentView, setCurrentView, selectedEventId, setSelectedEventId, user }) {
  if (currentView === 'new_event') {
    return <NewEventForm onBack={() => setCurrentView('dashboard')} user={user} />;
  }

  if (currentView === 'return_props') {
    const eventToReturn = events.find(e => e.id === selectedEventId);
    if (!eventToReturn) {
      setCurrentView('dashboard');
      return null;
    }
    return <ReturnPropsForm event={eventToReturn} onBack={() => setCurrentView('dashboard')} />;
  }

  // Dashboard View
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between mb-6 mt-2">
        <h2 className="text-2xl font-bold text-slate-800">Мои выезды</h2>
        <button 
          onClick={() => setCurrentView('new_event')}
          className="bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white px-4 py-2.5 rounded-xl font-medium shadow-md shadow-purple-200 flex items-center gap-2 transition-transform active:scale-95"
        >
          <Package className="w-5 h-5" />
          <span>Новый</span>
        </button>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm mt-8">
          <div className="bg-purple-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardCheck className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-2">Нет активных выездов</h3>
          <p className="text-slate-500 text-sm mb-6">Создайте новый выезд перед отправлением на праздник, чтобы собрать реквизит.</p>
          <button 
            onClick={() => setCurrentView('new_event')}
            className="text-purple-600 font-medium bg-purple-50 px-6 py-2.5 rounded-lg w-full active:bg-purple-100 transition-colors"
          >
            Начать сбор реквизита
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-bold tracking-wider text-slate-400 uppercase ml-1">В процессе</h3>
          {events.map(event => (
            <div key={event.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-400"></div>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="font-bold text-slate-800 text-lg">{event.programName}</h4>
                  <div className="flex items-center gap-1.5 text-slate-500 mt-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm">{event.date}</span>
                  </div>
                </div>
                <span className="bg-orange-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-md border border-orange-100">
                  На празднике
                </span>
              </div>
              
              <div className="text-sm text-slate-600 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                Взято реквизита: <strong className="text-slate-800">{event.propsTaken?.length || 0}</strong> позиций
              </div>

              <button 
                onClick={() => { setSelectedEventId(event.id); setCurrentView('return_props'); }}
                className="w-full bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <span>Сдать реквизит</span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewEventForm({ onBack, user }) {
  const [selectedProgram, setSelectedProgram] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkedProps, setCheckedProps] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const program = PROGRAMS.find(p => p.id === selectedProgram);

  const toggleProp = (propName) => {
    setCheckedProps(prev => ({ ...prev, [propName]: !prev[propName] }));
  };

  const isAllChecked = program && program.props.every(p => checkedProps[p]);
  const checkedCount = Object.values(checkedProps).filter(Boolean).length;

  const handleSubmit = async () => {
    if (!program || isSubmitting || !user) return;
    
    // Must select at least something, ideally everything
    if (checkedCount === 0) return;

    setIsSubmitting(true);
    try {
      const eventsRef = collection(db, 'artifacts', appId, 'public', 'data', 'events');
      
      const propsTaken = program.props.filter(p => checkedProps[p]);
      
      await addDoc(eventsRef, {
        animatorId: user.uid,
        animatorName: 'Аниматор (Сотрудник)', // In a real app, from user profile
        programId: program.id,
        programName: program.name,
        date: date,
        status: 'at_event',
        propsTaken: propsTaken,
        createdAt: serverTimestamp()
      });
      onBack();
    } catch (e) {
      console.error("Error creating event", e);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-500 mb-4 p-1 -ml-1 active:bg-slate-100 rounded-lg">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Назад</span>
      </button>

      <h2 className="text-2xl font-bold text-slate-800 mb-6">Новый выезд</h2>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6 space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2">Программа</label>
          <select 
            value={selectedProgram}
            onChange={(e) => {
              setSelectedProgram(e.target.value);
              setCheckedProps({}); // reset on change
            }}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent appearance-none font-medium text-lg"
          >
            <option value="" disabled>Выберите программу...</option>
            {PROGRAMS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-600 mb-2">Дата выезда</label>
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl px-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-lg"
          />
        </div>
      </div>

      {program && (
        <div className="animate-in fade-in duration-300">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-slate-700 text-lg">Чек-лист: СБОР</h3>
            <span className="text-sm font-bold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
              {checkedCount} / {program.props.length}
            </span>
          </div>
          
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-24">
            {program.props.map((propName, idx) => (
              <div 
                key={idx} 
                onClick={() => toggleProp(propName)}
                className={`flex items-center gap-4 p-5 cursor-pointer active:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${checkedProps[propName] ? 'bg-purple-50/30' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checkedProps[propName] ? 'bg-purple-500 border-purple-500' : 'border-slate-300'}`}>
                  {checkedProps[propName] && <Check className="w-5 h-5 text-white stroke-[3]" />}
                </div>
                <span className={`text-lg transition-colors ${checkedProps[propName] ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>
                  {propName}
                </span>
              </div>
            ))}
          </div>

          <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe z-50">
            <div className="max-w-md mx-auto">
               <button 
                  onClick={handleSubmit}
                  disabled={checkedCount === 0 || isSubmitting}
                  className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                    checkedCount === 0 
                      ? 'bg-slate-100 text-slate-400' 
                      : !isAllChecked 
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200' 
                        : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-200'
                  }`}
                >
                  {isSubmitting ? 'Сохранение...' : (
                    <>
                      <span>Подтвердить и поехать</span>
                      {!isAllChecked && checkedCount > 0 && <AlertCircle className="w-5 h-5" />}
                    </>
                  )}
                </button>
                {!isAllChecked && checkedCount > 0 && (
                  <p className="text-center text-xs text-amber-600 font-medium mt-2">
                    Внимание: Вы отметили не весь реквизит!
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReturnPropsForm({ event, onBack }) {
  // Initialize checklist with nothing checked
  const [checkedProps, setCheckedProps] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleProp = (propName) => {
    setCheckedProps(prev => ({ ...prev, [propName]: !prev[propName] }));
  };

  const propsToReturn = event.propsTaken || [];
  const checkedCount = Object.values(checkedProps).filter(Boolean).length;
  const allReturned = checkedCount === propsToReturn.length;

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const eventRef = doc(db, 'artifacts', appId, 'public', 'data', 'events', event.id);
      
      const propsReturned = propsToReturn.filter(p => checkedProps[p]);
      
      await updateDoc(eventRef, {
        status: 'completed',
        propsReturned: propsReturned,
        returnedAt: serverTimestamp()
      });
      onBack();
    } catch (e) {
      console.error("Error updating event", e);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="animate-in slide-in-from-right-4 duration-300">
      <button onClick={onBack} className="flex items-center gap-1 text-slate-500 mb-4 p-1 -ml-1 active:bg-slate-100 rounded-lg">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Назад</span>
      </button>

      <div className="mb-6">
        <span className="inline-block px-3 py-1 bg-orange-100 text-orange-700 font-bold text-xs rounded-full mb-2">Возврат</span>
        <h2 className="text-2xl font-bold text-slate-800">{event.programName}</h2>
        <p className="text-slate-500 font-medium flex items-center gap-1 mt-1">
          <Calendar className="w-4 h-4" /> {event.date}
        </p>
      </div>

      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-bold text-slate-700 text-lg">Чек-лист: ВОЗВРАТ</h3>
        <span className="text-sm font-bold bg-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
          {checkedCount} / {propsToReturn.length}
        </span>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-24">
        {propsToReturn.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            Никакой реквизит не был отмечен при сборе.
          </div>
        ) : (
          propsToReturn.map((propName, idx) => (
            <div 
              key={idx} 
              onClick={() => toggleProp(propName)}
              className={`flex items-center gap-4 p-5 cursor-pointer active:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${checkedProps[propName] ? 'bg-blue-50/30' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checkedProps[propName] ? 'bg-blue-500 border-blue-500' : 'border-slate-300'}`}>
                {checkedProps[propName] && <Check className="w-5 h-5 text-white stroke-[3]" />}
              </div>
              <span className={`text-lg transition-colors ${checkedProps[propName] ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>
                {propName}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-100 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-safe z-50">
        <div className="max-w-md mx-auto">
           <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                !allReturned 
                  ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-200' 
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
              }`}
            >
              {isSubmitting ? 'Отправка...' : (
                <>
                  <span>Отправить руководителю</span>
                  {!allReturned && <AlertCircle className="w-5 h-5" />}
                </>
              )}
            </button>
            {!allReturned && propsToReturn.length > 0 && (
              <p className="text-center text-xs text-rose-600 font-bold mt-2">
                Внимание: Отмечен не весь реквизит!
              </p>
            )}
        </div>
      </div>
    </div>
  );
}

function ManagerFlow({ events }) {
  const [expandedEvent, setExpandedEvent] = useState(null);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="mb-6 mt-2">
        <h2 className="text-2xl font-bold text-slate-800">Отчеты сотрудников</h2>
        <p className="text-slate-500 mt-1">Сводка по выездам и реквизиту</p>
      </div>

      {events.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 shadow-sm mt-8">
          <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-2">Отчетов пока нет</h3>
          <p className="text-slate-500 text-sm">Здесь будут появляться данные от аниматоров.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map(event => {
            const isCompleted = event.status === 'completed';
            const propsTaken = event.propsTaken || [];
            const propsReturned = event.propsReturned || [];
            
            // Calculate missing props
            const missingProps = propsTaken.filter(prop => !propsReturned.includes(prop));
            const hasMissing = isCompleted && missingProps.length > 0;
            const isPerfect = isCompleted && missingProps.length === 0 && propsTaken.length > 0;

            const isExpanded = expandedEvent === event.id;

            return (
              <div 
                key={event.id} 
                className={`bg-white rounded-2xl shadow-sm border transition-all overflow-hidden ${hasMissing ? 'border-rose-200' : 'border-slate-100'}`}
              >
                {/* Header Card (Clickable) */}
                <div 
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  className="p-5 cursor-pointer active:bg-slate-50"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-bold text-slate-800">{event.programName}</h4>
                      <div className="flex items-center gap-2 text-slate-500 mt-1">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm">{event.date}</span>
                        <span className="text-slate-300">•</span>
                        <span className="text-sm font-medium">{event.animatorName || 'Аниматор'}</span>
                      </div>
                    </div>
                    
                    {/* Status Badge */}
                    {!isCompleted ? (
                      <span className="bg-orange-50 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-md border border-orange-100 flex items-center gap-1">
                        В процессе
                      </span>
                    ) : hasMissing ? (
                      <span className="bg-rose-50 text-rose-600 text-xs font-bold px-2.5 py-1 rounded-md border border-rose-100 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Недостача
                      </span>
                    ) : (
                      <span className="bg-emerald-50 text-emerald-600 text-xs font-bold px-2.5 py-1 rounded-md border border-emerald-100 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Сдано
                      </span>
                    )}
                  </div>
                  
                  {isCompleted && !isExpanded && (
                     <div className="mt-3 text-sm flex gap-4">
                        <span className="text-slate-500">Взято: <strong className="text-slate-800">{propsTaken.length}</strong></span>
                        <span className="text-slate-500">Возврат: <strong className={hasMissing ? 'text-rose-600' : 'text-emerald-600'}>{propsReturned.length}</strong></span>
                     </div>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-50 bg-slate-50/50 animate-in slide-in-from-top-2">
                    <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Детализация реквизита</h5>
                    
                    {!isCompleted ? (
                      <div className="space-y-2">
                        {propsTaken.map((prop, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-white p-2.5 rounded-lg border border-slate-100">
                             <Package className="w-4 h-4 text-orange-400" />
                             {prop}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Perfect Match */}
                        {isPerfect && (
                          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-emerald-700 text-sm font-medium flex items-center gap-2 mb-3">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                            Весь реквизит успешно возвращен!
                          </div>
                        )}

                        {/* List taken items with return status */}
                        {propsTaken.map((prop, i) => {
                          const isReturned = propsReturned.includes(prop);
                          return (
                            <div key={i} className={`flex justify-between items-center text-sm p-3 rounded-lg border ${isReturned ? 'bg-white border-slate-100 text-slate-700' : 'bg-rose-50 border-rose-200 text-rose-800 font-medium'}`}>
                               <span className="flex items-center gap-2">
                                  {isReturned ? <Check className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-rose-500" />}
                                  {prop}
                               </span>
                               <span className="text-xs opacity-70">
                                 {isReturned ? 'Сдано' : 'Утеряно'}
                               </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}