import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Compass, 
  Menu,
  MapPin, 
  Calendar, 
  Clock, 
  Star, 
  ArrowRight, 
  Loader2, 
  ChevronRight, 
  Info, 
  CheckCircle2, 
  ChevronLeft,
  X,
  Send,
  Search,
  User,
  Bot,
  MessageSquare,
  AlertCircle,
  Hotel,
  Ticket,
  Car,
  Camera,
  ExternalLink,
  Map as MapIcon,
  Sun,
  Moon,
  Save,
  Folder,
  Trash2,
  History,
  Plus,
  Music,
  PartyPopper,
  QrCode,
  Crown,
  Smartphone,
  CreditCard,
  Landmark,
  Paperclip,
  Mic
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { generateTravelPlan, getPlaceInfo, TravelPlan } from './services/travelService';
import { searchTransitLocal, TransitMode } from './services/transitService';
import { auth, loginWithGoogle, logout, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

// Remove Google Maps imports
// import { APIProvider } from '@vis.gl/react-google-maps';
// import { NearbySearch } from './components/NearbySearch';

// const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
// const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

import { GoogleGenAI, Type } from "@google/genai";
import { translations, Language, SuggestedTopic } from './translations';

// --- Types ---

interface Message {
  id: string;
  type: 'user' | 'ai' | 'loading' | 'error';
  content?: string;
  plan?: TravelPlan;
  streamingText?: string;
  timestamp: Date;
}

interface SavedSession {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

// --- Components ---

const OlachillLogo = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
    <rect x="3" y="3" width="58" height="58" rx="18" fill="#0F172A" />
    <rect x="8" y="8" width="48" height="22" rx="10" fill="#4FA9E8" />
    <path d="M8 43C14 34 22 30 32 30C42 30 50 34 56 43V56H8V43Z" fill="#73C95E" />
    <path d="M8 49C15 42 23 39 32 39C41 39 49 42 56 49V56H8V49Z" fill="#4BAF4D" />
    <path d="M20 28C20 20.2 25.5 15 32 15C38.5 15 44 20.2 44 28H20Z" fill="#111827" />
    <path d="M32 28V39.5" stroke="#E5E7EB" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M32 39.5C32 42.2 30.4 44 27.8 44.1" stroke="#E5E7EB" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M25 19.5L31 14L40.5 16.4L34.2 24.4L25 19.5Z" fill="#75A92E" stroke="#3F6212" strokeWidth="1.4" />
  </svg>
);

const SplashScreen = ({ language }: { language: Language }) => (
  <div className="fixed inset-0 bg-white dark:bg-stone-950 z-[200] flex flex-col items-center justify-center p-6 text-center">
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="w-24 h-24 bg-gradient-to-br from-sky-100 to-lime-100 dark:from-stone-900 dark:to-stone-800 rounded-[32px] flex items-center justify-center mb-8 shadow-2xl border border-emerald-100 dark:border-stone-700 p-2"
    >
      <OlachillLogo className="w-full h-full animate-pulse" />
    </motion.div>
    <h1 className="text-4xl font-serif italic mb-4 dark:text-white">{translations[language].appName}</h1>
    <p className="text-stone-400 dark:text-stone-500 max-w-xs leading-relaxed">
      {translations[language].splashMessage}
    </p>
  </div>
);

const ErrorBoundary = ({ children, language }: { children: React.ReactNode, language: Language }) => {
  const [hasError, setHasError] = useState(false);
  const t = translations[language] || translations['vi'];

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      console.error("Caught by boundary:", error);
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h2 className="text-2xl font-serif mb-4">{t.errorOccurred}</h2>
          <p className="text-stone-500 mb-8">{t.errorUnexpected}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-stone-900 text-white px-8 py-3 rounded-2xl hover:bg-stone-800 transition-colors"
          >
            {t.reloadPage}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};



// --- Services ---

const searchTransit = async (
  from: string,
  to: string,
  _date: string,
  time: string,
  _language: Language,
  mode: TransitMode
) => {
  return searchTransitLocal(from, to, time, mode);
};

// --- Components ---

const JAPAN_STATIONS_BY_CITY: Record<string, string[]> = {
  'Tokyo': ['Tokyo', 'Shinjuku', 'Shibuya', 'Ueno', 'Shinagawa', 'Ikebukuro', 'Akihabara', 'Asakusa', 'Ginza', 'Roppongi', 'Harajuku', 'Omotesando', 'Ebisu', 'Nakano', 'Kichijoji', 'Shimokitazawa', 'Hachioji', 'Tachikawa'],
  'Osaka': ['Osaka', 'Shin-Osaka', 'Namba', 'Umeda', 'Tennoji', 'Kyobashi', 'Yodoyabashi', 'Shinsaibashi', 'Nipponbashi'],
  'Kyoto': ['Kyoto', 'Gion-Shijo', 'Kawaramachi', 'Arashiyama', 'Fushimi-Inari', 'Kiyomizu-Gojo'],
  'Nagoya': ['Nagoya', 'Kanayama', 'Sakae', 'Osu Kannon', 'Nagoya-ko', 'Fujigaoka'],
  'Yokohama': ['Yokohama', 'Sakuragicho', 'Minato Mirai', 'Shin-Yokohama', 'Motomachi-Chukagai'],
  'Fukuoka': ['Hakata', 'Tenjin', 'Nakasu-Kawabata', 'Fukuoka Airport'],
  'Sapporo': ['Sapporo', 'Odori', 'Susukino'],
  'Hiroshima': ['Hiroshima', 'Miyajimaguchi', 'Hatchobori'],
  'Nara': ['Nara', 'Kintetsu-Nara'],
  'Kobe': ['Sannomiya', 'Kobe', 'Motomachi', 'Shin-Kobe'],
  'Hakone': ['Hakone-Yumoto', 'Gora', 'Togendai'],
  'Nikko': ['Nikko', 'Tobu-Nikko'],
  'Kamakura': ['Kamakura', 'Hase', 'Kita-Kamakura'],
  'Kawaguchiko': ['Kawaguchiko', 'Fujisan']
};

const ALL_STATIONS = Array.from(new Set([
  ...Object.keys(JAPAN_STATIONS_BY_CITY),
  ...Object.values(JAPAN_STATIONS_BY_CITY).flat()
]));

const TrainSearch = ({
  onClose,
  language,
  initialMode = 'train'
}: {
  onClose: () => void,
  language: Language,
  initialMode?: TransitMode
}) => {
  const t = translations[language];
  const modeCopyByLang = {
    vi: {
      trainTitle: t.trainSearchTitle,
      trainSubtitle: t.trainSearchSubtitle,
      busTitle: 'Tra cứu tuyến xe bus',
      busSubtitle: 'Dữ liệu xe bus local tiết kiệm chi phí'
    },
    en: {
      trainTitle: t.trainSearchTitle,
      trainSubtitle: t.trainSearchSubtitle,
      busTitle: 'Bus Route Search',
      busSubtitle: 'Local bus timetable data (cost-saving)'
    },
    ja: {
      trainTitle: t.trainSearchTitle,
      trainSubtitle: t.trainSearchSubtitle,
      busTitle: 'バス路線検索',
      busSubtitle: 'ローカルバス時刻表データ（低コスト）'
    }
  } as const;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [mode, setMode] = useState<TransitMode>(initialMode);
  const [showResults, setShowResults] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState<string[]>([]);
  const [toSuggestions, setToSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const modeCopy = modeCopyByLang[language];

  useEffect(() => {
    setMode(initialMode);
    setShowResults(false);
    setResults([]);
  }, [initialMode]);

  const getSuggestions = (val: string) => {
    if (val.length === 0) return [];
    
    const searchVal = val.toLowerCase();
    
    // 1. Check if it's a city name
    const matchingCity = Object.keys(JAPAN_STATIONS_BY_CITY).find(city => city.toLowerCase() === searchVal);
    if (matchingCity) {
      return JAPAN_STATIONS_BY_CITY[matchingCity];
    }
    
    // 2. Otherwise, filter all stations and cities
    return ALL_STATIONS.filter(s => s.toLowerCase().includes(searchVal)).slice(0, 8);
  };

  const handleFromChange = (val: string) => {
    setFrom(val);
    setFromSuggestions(getSuggestions(val));
  };

  const handleToChange = (val: string) => {
    setTo(val);
    setToSuggestions(getSuggestions(val));
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!from || !to) return;
    
    setSearching(true);
    const transitResults = await searchTransit(from, to, date, time, language, mode);
    setResults(transitResults);
    setSearching(false);
    setShowResults(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-2xl w-full max-h-[88vh] sm:max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <span className="text-lg">{mode === 'train' ? '🚄' : '🚌'}</span>
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{mode === 'train' ? modeCopy.trainTitle : modeCopy.busTitle}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{mode === 'train' ? modeCopy.trainSubtitle : modeCopy.busSubtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
          <X size={20} className="text-stone-400" />
        </button>
      </div>

      {!showResults ? (
        <form onSubmit={handleSearch} className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('train')}
              className={`py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                mode === 'train'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                  : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
              }`}
            >
              <span>🚄</span>
              <span>{t.transitTrain}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('bus')}
              className={`py-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 ${
                mode === 'bus'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                  : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
              }`}
            >
              <span>🚌</span>
              <span>{t.transitBus}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 relative">
              <label className="text-xs font-bold text-stone-500 dark:text-stone-400 ml-1">{t.from}</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 w-4 h-4" />
                <input 
                  type="text" 
                  value={from}
                  onChange={(e) => handleFromChange(e.target.value)}
                  placeholder={t.fromPlaceholder}
                  className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 text-stone-900 dark:text-white"
                />
              </div>
              {fromSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl shadow-xl overflow-hidden">
                  {fromSuggestions.map(s => (
                    <button 
                      key={s}
                      type="button"
                      onClick={() => { setFrom(s); setFromSuggestions([]); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2 relative">
              <label className="text-xs font-bold text-stone-500 dark:text-stone-400 ml-1">{t.to}</label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 w-4 h-4" />
                <input 
                  type="text" 
                  value={to}
                  onChange={(e) => handleToChange(e.target.value)}
                  placeholder={t.toPlaceholder}
                  className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-blue-500/20 text-stone-900 dark:text-white"
                />
              </div>
              {toSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-xl shadow-xl overflow-hidden">
                  {toSuggestions.map(s => (
                    <button 
                      key={s}
                      type="button"
                      onClick={() => { setTo(s); setToSuggestions([]); }}
                      className="w-full px-4 py-2 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 dark:text-stone-400 ml-1">{t.date}</label>
              <input 
                type="date" 
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 px-6 text-sm focus:ring-2 focus:ring-blue-500/20 text-stone-900 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-500 dark:text-stone-400 ml-1">{t.time}</label>
              <input 
                type="time" 
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 px-6 text-sm focus:ring-2 focus:ring-blue-500/20 text-stone-900 dark:text-white"
              />
            </div>
          </div>
          <button 
            type="submit"
            disabled={searching}
            className="w-full bg-blue-600 text-white py-5 rounded-2xl font-bold text-base hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all mt-4 flex items-center justify-center gap-2"
          >
            {searching ? <Loader2 className="animate-spin" /> : null}
            {t.searchRoute}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 px-2">
            <p className="text-sm font-medium text-stone-500">{t.resultsFor}: <span className="text-stone-900 dark:text-white font-bold">{from} → {to}</span></p>
            <button onClick={() => setShowResults(false)} className="text-xs text-blue-600 font-bold hover:underline">{t.changeSearch}</button>
          </div>
          {results.length > 0 ? results.map((res, i) => (
            <div key={i} className="bg-stone-50 dark:bg-stone-800 p-5 rounded-2xl border border-stone-100 dark:border-stone-700 hover:border-blue-500/30 transition-all">
              <div className="flex justify-between items-start mb-4">
                <span className="text-xs font-bold px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">{res.type}</span>
                <span className="text-lg font-mono font-bold text-stone-900 dark:text-white">{res.price}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-stone-900 dark:text-white">{res.departure}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-bold">{from}</p>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <p className="text-[10px] text-stone-400 font-medium">{res.time}</p>
                  <div className="w-full h-px bg-stone-200 dark:bg-stone-700 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-stone-300" />
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-stone-300" />
                  </div>
                  <p className="text-[10px] text-stone-400 font-medium">{res.changes} {t.transfers}</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-stone-900 dark:text-white">{res.arrival}</p>
                  <p className="text-[10px] text-stone-400 uppercase font-bold">{to}</p>
                </div>
              </div>
            </div>
          )) : (
            <div className="text-center py-10">
              <p className="text-stone-400 italic">{t.noResultsFound}</p>
            </div>
          )}
          <p className="text-[9px] text-stone-400 text-center italic mt-6">{t.aiDataNote}</p>
        </div>
      )}
    </motion.div>
  );
};

const CafeSearch = ({ onClose, language }: { onClose: () => void, language: Language }) => {
  const t = translations[language];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Find best cafes and restaurants in Japan for: ${query}. 
      Provide 5 recommendations with: name, type, priceRange (e.g. $, $$, $$$), description, and location.
      Respond in ${language === 'vi' ? 'Vietnamese' : language === 'ja' ? 'Japanese' : 'English'}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                priceRange: { type: Type.STRING },
                description: { type: Type.STRING },
                location: { type: Type.STRING }
              },
              required: ["name", "type", "priceRange", "description", "location"]
            }
          }
        }
      });
      setResults(JSON.parse(response.text));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-2xl w-full max-h-[88vh] sm:max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/20 rounded-xl flex items-center justify-center text-orange-600 dark:text-orange-400">
            <Music size={20} />
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{t.cafeSearchTitle}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{t.cafeSearchSubtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
          <X size={20} className="text-stone-400" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="relative mb-8">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.cafePlaceholder}
          className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-orange-500/20 text-stone-900 dark:text-white"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 w-4 h-4" />
        <button 
          disabled={loading}
          className="absolute right-2 top-2 bottom-2 bg-orange-600 text-white px-4 rounded-xl text-xs font-bold hover:bg-orange-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin w-4 h-4" /> : t.searchRoute}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-8">
        {['Sushi', 'Ramen', 'Cafe', 'Matcha', 'Izakaya', 'Wagyu'].map(cat => (
          <button 
            key={cat}
            onClick={() => { setQuery(cat); }}
            className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 rounded-lg text-[10px] font-bold text-stone-500 hover:bg-orange-50 hover:text-orange-600 transition-colors"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {results.map((res, i) => (
          <div key={i} className="bg-stone-50 dark:bg-stone-800 p-5 rounded-2xl border border-stone-100 dark:border-stone-700">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-stone-900 dark:text-white">{res.name}</h4>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{res.priceRange}</span>
            </div>
            <p className="text-[10px] text-stone-400 uppercase font-bold mb-2">{res.type} • {res.location}</p>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">{res.description}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const SecondHandSearch = ({ onClose, language }: { onClose: () => void, language: Language }) => {
  const t = translations[language];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `Find best second-hand shops or areas in Japan for: ${query}. 
      Provide 5 recommendations with: name, type (e.g. Hard Off, Book Off, local area), description, and location.
      Respond in ${language === 'vi' ? 'Vietnamese' : language === 'ja' ? 'Japanese' : 'English'}.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                type: { type: Type.STRING },
                description: { type: Type.STRING },
                location: { type: Type.STRING }
              },
              required: ["name", "type", "description", "location"]
            }
          }
        }
      });
      setResults(JSON.parse(response.text));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-2xl w-full max-h-[88vh] sm:max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400">
            <Plus size={20} />
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{t.secondHandTitle}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{t.secondHandSubtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
          <X size={20} className="text-stone-400" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="relative mb-8">
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.secondHandPlaceholder}
          className="w-full bg-stone-50 dark:bg-stone-800 border-none rounded-2xl py-4 pl-12 pr-4 text-sm focus:ring-2 focus:ring-purple-500/20 text-stone-900 dark:text-white"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 w-4 h-4" />
        <button 
          disabled={loading}
          className="absolute right-2 top-2 bottom-2 bg-purple-600 text-white px-4 rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin w-4 h-4" /> : t.searchRoute}
        </button>
      </form>

      <div className="flex flex-wrap gap-2 mb-8">
        {['Camera', 'Electronics', 'Fashion', 'Anime Figure', 'Luxury Bag', 'Instrument'].map(cat => (
          <button 
            key={cat}
            onClick={() => { setQuery(cat); }}
            className="px-3 py-1.5 bg-stone-100 dark:bg-stone-800 rounded-lg text-[10px] font-bold text-stone-500 hover:bg-purple-50 hover:text-purple-600 transition-colors"
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {results.map((res, i) => (
          <div key={i} className="bg-stone-50 dark:bg-stone-800 p-5 rounded-2xl border border-stone-100 dark:border-stone-700">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-stone-900 dark:text-white">{res.name}</h4>
              <span className="text-[10px] font-bold px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md">{res.type}</span>
            </div>
            <p className="text-[10px] text-stone-400 uppercase font-bold mb-2">{res.location}</p>
            <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">{res.description}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

const Personalization = ({ onClose, language, user, currentPrefs }: { onClose: () => void, language: Language, user: FirebaseUser | null, currentPrefs: any }) => {
  const t = translations[language].personalization;
  const [budget, setBudget] = useState(currentPrefs?.budget || 'medium');
  const [travelStyle, setTravelStyle] = useState(currentPrefs?.travelStyle || 'balanced');
  const [interests, setInterests] = useState<string[]>(currentPrefs?.interests || []);
  const [dietary, setDietary] = useState(currentPrefs?.dietary || 'none');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', user.uid, 'preferences', 'main'), {
        uid: user.uid,
        budget,
        travelStyle,
        interests,
        dietary,
        updatedAt: serverTimestamp()
      });
      alert(t.preferencesSaved);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setInterests(prev => 
      prev.includes(interest) ? prev.filter(i => i !== interest) : [...prev, interest]
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-stone-900 p-8 rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <User size={20} />
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{t.title}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{t.subtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
          <X size={20} className="text-stone-400" />
        </button>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <label className="text-sm font-bold text-stone-700 dark:text-stone-300">{t.budget}</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'low', label: t.budgetLow },
              { id: 'medium', label: t.budgetMedium },
              { id: 'high', label: t.budgetHigh }
            ].map(b => (
              <button 
                key={b.id}
                onClick={() => setBudget(b.id)}
                className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                  budget === b.id 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' 
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-stone-700 dark:text-stone-300">{t.travelStyle}</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'relaxed', label: t.styleRelaxed },
              { id: 'balanced', label: t.styleBalanced },
              { id: 'active', label: t.styleActive }
            ].map(s => (
              <button 
                key={s.id}
                onClick={() => setTravelStyle(s.id)}
                className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                  travelStyle === s.id 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' 
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-stone-700 dark:text-stone-300">{t.interests}</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'culture', label: t.interestCulture },
              { id: 'food', label: t.interestFood },
              { id: 'nature', label: t.interestNature },
              { id: 'shopping', label: t.interestShopping },
              { id: 'anime', label: t.interestAnime },
              { id: 'nightlife', label: t.interestNightlife }
            ].map(i => (
              <button 
                key={i.id}
                onClick={() => toggleInterest(i.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-all border ${
                  interests.includes(i.id) 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' 
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
                }`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-sm font-bold text-stone-700 dark:text-stone-300">{t.dietary}</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'none', label: t.dietNone },
              { id: 'vegetarian', label: t.dietVegetarian },
              { id: 'halal', label: t.dietHalal },
              { id: 'gluten-free', label: t.dietGlutenFree }
            ].map(d => (
              <button 
                key={d.id}
                onClick={() => setDietary(d.id)}
                className={`py-3 rounded-xl text-xs font-bold transition-all border ${
                  dietary === d.id 
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/20' 
                    : 'bg-stone-50 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border-stone-100 dark:border-stone-700 hover:bg-stone-100'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={saving || !user}
          className="w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-5 rounded-2xl font-bold text-base hover:bg-stone-800 dark:hover:bg-stone-200 transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {t.savePreferences}
        </button>
      </div>
    </motion.div>
  );
};

const TicketSearch = ({ onClose, language }: { onClose: () => void, language: Language }) => {
  const t = translations[language];
  const categories = [t.categories.all, t.categories.themePark, t.categories.museum, t.categories.observatory, t.categories.experience];
  const [activeCat, setActiveCat] = useState(t.categories.all);
  const [qrTicket, setQrTicket] = useState<{ name: string; slug: string } | null>(null);

  const getBrandedLink = (slug: string) => {
    if (typeof window === 'undefined') return `/go/${slug}`;
    return `${window.location.origin}/go/${slug}`;
  };

  const openPartnerLink = (slug: string) => {
    window.open(`/go/${slug}`, '_blank', 'noopener,noreferrer');
  };

  const tickets = [
    { 
      name: 'Tokyo Disneyland', 
      price: '8,400 JPY', 
      icon: '🎡', 
      cat: t.categories.themePark, 
      rating: 4.9,
      image: 'https://picsum.photos/seed/disney/400/250',
      slug: 'tokyo-disneyland'
    },
    { 
      name: 'Universal Studios Japan', 
      price: '8,600 JPY', 
      icon: '🎢', 
      cat: t.categories.themePark, 
      rating: 4.8,
      image: 'https://picsum.photos/seed/usj/400/250',
      slug: 'usj'
    },
    { 
      name: 'TeamLab Borderless', 
      price: '3,800 JPY', 
      icon: '💡', 
      cat: t.categories.museum, 
      rating: 4.9,
      image: 'https://picsum.photos/seed/teamlab/400/250',
      slug: 'teamlab-borderless'
    },
    { 
      name: 'Shibuya Sky', 
      price: '2,200 JPY', 
      icon: '🏙️', 
      cat: t.categories.observatory, 
      rating: 4.7,
      image: 'https://picsum.photos/seed/shibuya/400/250',
      slug: 'shibuya-sky'
    },
    { 
      name: 'Ghibli Museum', 
      price: '1,000 JPY', 
      icon: '🌳', 
      cat: t.categories.museum, 
      rating: 5.0,
      image: 'https://picsum.photos/seed/ghibli/400/250',
      slug: 'ghibli-museum'
    },
    { 
      name: 'Tokyo Skytree', 
      price: '3,100 JPY', 
      icon: '🗼', 
      cat: t.categories.observatory, 
      rating: 4.6,
      image: 'https://picsum.photos/seed/skytree/400/250',
      slug: 'tokyo-skytree'
    },
    { 
      name: 'Kyoto Kimono Rental', 
      price: '3,500 JPY', 
      icon: '👘', 
      cat: t.categories.experience, 
      rating: 4.8,
      image: 'https://picsum.photos/seed/kimono/400/250',
      slug: 'kyoto-kimono'
    },
    { 
      name: 'Nara Deer Park Tour', 
      price: '5,000 JPY', 
      icon: '🦌', 
      cat: t.categories.experience, 
      rating: 4.7,
      image: 'https://picsum.photos/seed/nara/400/250',
      slug: 'nara-deer-park'
    }
  ];

  const filtered = activeCat === t.categories.all ? tickets : tickets.filter(t => t.cat === activeCat);

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Ticket size={20} />
            </div>
            <div>
              <h3 className="text-xl font-serif dark:text-white">{t.ticketsTitle}</h3>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{t.ticketsSubtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
            <X size={20} className="text-stone-400" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                activeCat === cat 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {filtered.map((ticket, i) => (
            <div key={i} className="group bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 overflow-hidden hover:shadow-xl transition-all flex flex-col">
              <div className="relative h-40 overflow-hidden">
                <img 
                  src={ticket.image} 
                  alt={ticket.name} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute top-3 left-3 bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] font-bold text-amber-500 shadow-sm">
                  <Star size={10} fill="currentColor" />
                  {ticket.rating}
                </div>
                <div className="absolute top-3 right-3 bg-white/90 dark:bg-stone-900/90 backdrop-blur-sm w-8 h-8 rounded-lg flex items-center justify-center text-lg shadow-sm">
                  {ticket.icon}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="mb-4">
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mb-1">{ticket.cat}</p>
                  <h4 className="font-bold text-stone-900 dark:text-white text-sm line-clamp-1">{ticket.name}</h4>
                </div>
                <div className="flex items-center justify-between mt-auto gap-2">
                  <div className="flex flex-col">
                    <span className="text-[9px] text-stone-400 uppercase font-bold">{t.priceFrom}</span>
                    <span className="text-sm font-mono font-bold text-stone-900 dark:text-white">{ticket.price}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQrTicket({ name: ticket.name, slug: ticket.slug })}
                      className="w-10 h-10 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-500 hover:text-emerald-600 transition-colors flex items-center justify-center"
                      title="QR"
                    >
                      <QrCode size={16} />
                    </button>
                    <button 
                      onClick={() => openPartnerLink(ticket.slug)}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[10px] font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
                    >
                      {t.buyNow}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-stone-400 text-center italic mt-8">{t.referencePriceNote}</p>
      </motion.div>

      <AnimatePresence>
        {qrTicket && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQrTicket(null)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative w-full max-w-sm bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-3xl p-6 text-center shadow-2xl"
            >
              <button
                onClick={() => setQrTicket(null)}
                className="absolute top-3 right-3 p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X size={18} className="text-stone-400" />
              </button>
              <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400 mb-1">Olachill Link</p>
              <h4 className="font-bold text-stone-900 dark:text-white mb-4">{qrTicket.name}</h4>
              <div className="w-56 h-56 mx-auto rounded-2xl bg-stone-50 dark:bg-stone-800 p-3 flex items-center justify-center border border-stone-100 dark:border-stone-700">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(getBrandedLink(qrTicket.slug))}`}
                  alt={`${qrTicket.name} QR`}
                  className="w-full h-full rounded-xl"
                />
              </div>
              <p className="text-[11px] text-stone-400 mt-4">Quét QR để mở link thương hiệu của Olachill.</p>
              <button
                onClick={() => openPartnerLink(qrTicket.slug)}
                className="mt-4 w-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 py-3 rounded-xl text-sm font-bold hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors"
              >
                Mở Link
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

interface EsimPlan {
  id: string;
  name: string;
  country: string;
  data: string;
  validityDays: number;
  priceUsd: number;
  currency: string;
  checkoutUrl?: string;
}

type EsimPaymentMethod = 'stripe' | 'paypal' | 'bank_transfer';

const EsimShop = ({ onClose, language }: { onClose: () => void; language: Language }) => {
  const copyByLang = {
    vi: {
      title: 'eSIM du lịch',
      subtitle: 'Mua eSIM từ API nhà cung cấp thật',
      reload: 'Tải lại',
      buy: 'Chọn thanh toán',
      loading: 'Đang tải gói eSIM...',
      noPlans: 'Chưa có gói eSIM phù hợp.',
      day: 'ngày',
      sourceProvider: 'Nguồn: nhà cung cấp',
      sourceFallback: 'Nguồn: fallback local',
      checkoutMissing: 'Gói này chưa có link thanh toán từ nhà cung cấp.',
      paymentTitle: 'Phương thức thanh toán',
      paymentSubtitle: 'Chọn phương thức thanh toán phù hợp',
      totalAmount: 'Tổng số tiền',
      packageLabel: 'Gói',
      selectMethod: 'Chọn phương thức thanh toán',
      methodStripe: 'Stripe (Card/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: 'Chuyển khoản ngân hàng (Nhật Bản)',
      payNow: 'Thanh toán ngay',
      processing: 'Đang tạo đơn...',
      estimatedLabel: 'Ước tính'
    },
    en: {
      title: 'Travel eSIM',
      subtitle: 'Plans from your real provider API',
      reload: 'Reload',
      buy: 'Choose Payment',
      loading: 'Loading eSIM plans...',
      noPlans: 'No matching eSIM plans.',
      day: 'days',
      sourceProvider: 'Source: provider',
      sourceFallback: 'Source: local fallback',
      checkoutMissing: 'This plan does not include a checkout URL yet.',
      paymentTitle: 'Payment Method',
      paymentSubtitle: 'Choose the payment option that fits',
      totalAmount: 'Total Amount',
      packageLabel: 'Package',
      selectMethod: 'Choose payment method',
      methodStripe: 'Stripe (Card/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: 'Bank Transfer (Japan)',
      payNow: 'Pay Now',
      processing: 'Creating order...',
      estimatedLabel: 'Estimated'
    },
    ja: {
      title: '旅行eSIM',
      subtitle: '実プロバイダーAPIのプラン',
      reload: '再読み込み',
      buy: '決済方法を選ぶ',
      loading: 'eSIMプランを読み込み中...',
      noPlans: '利用可能なeSIMプランがありません。',
      day: '日',
      sourceProvider: 'ソース: プロバイダー',
      sourceFallback: 'ソース: ローカルフォールバック',
      checkoutMissing: 'このプランには決済URLがありません。',
      paymentTitle: 'お支払い方法',
      paymentSubtitle: '最適なお支払い方法を選択',
      totalAmount: '合計金額',
      packageLabel: 'プラン',
      selectMethod: '支払い方法を選択',
      methodStripe: 'Stripe (カード/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: '銀行振込（日本）',
      payNow: '今すぐ支払う',
      processing: '注文を作成中...',
      estimatedLabel: '概算'
    }
  } as const;

  const copy = copyByLang[language];
  const [plans, setPlans] = useState<EsimPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'provider' | 'local-fallback' | ''>('');
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<EsimPlan | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<EsimPaymentMethod>('bank_transfer');

  const paymentMethods: { key: EsimPaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: 'stripe', label: copy.methodStripe, icon: <CreditCard size={20} /> },
    { key: 'paypal', label: copy.methodPaypal, icon: <CreditCard size={20} /> },
    { key: 'bank_transfer', label: copy.methodBank, icon: <Landmark size={20} /> }
  ];

  const toJpy = (plan: EsimPlan) => {
    if (plan.currency.toUpperCase() === 'JPY') return Math.round(plan.priceUsd);
    return Math.round(plan.priceUsd * 150);
  };

  const formatNumber = (value: number) => {
    const locale = language === 'vi' ? 'vi-VN' : language === 'ja' ? 'ja-JP' : 'en-US';
    return new Intl.NumberFormat(locale).format(value);
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/esim/plans?country=JP');
      const json = await resp.json();
      setPlans(Array.isArray(json?.plans) ? json.plans : []);
      setSource(json?.source === 'provider' ? 'provider' : 'local-fallback');
    } catch (e) {
      console.error(e);
      setPlans([]);
      setSource('local-fallback');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const openCheckoutUrl = (url: string) => {
    const ua = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);
    if (isMobile) {
      window.location.href = url;
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openPaymentSheet = (plan: EsimPlan) => {
    setSelectedPlan(plan);
    setSelectedPaymentMethod('bank_transfer');
  };

  const handleBuy = async (plan: EsimPlan, paymentMethod: EsimPaymentMethod): Promise<boolean> => {
    if (plan.checkoutUrl) {
      openCheckoutUrl(plan.checkoutUrl);
      return true;
    }

    try {
      setLoadingPlanId(plan.id);
      const resp = await fetch('/api/esim/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, paymentMethod })
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || copy.checkoutMissing);
        return false;
      }
      if (json?.checkoutUrl) {
        openCheckoutUrl(json.checkoutUrl);
        return true;
      }
      alert(copy.checkoutMissing);
      return false;
    } catch (e) {
      console.error(e);
      alert(copy.checkoutMissing);
      return false;
    } finally {
      setLoadingPlanId(null);
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedPlan) return;
    const ok = await handleBuy(selectedPlan, selectedPaymentMethod);
    if (ok) {
      setSelectedPlan(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl max-w-3xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 dark:bg-teal-900/20 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Smartphone size={20} />
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{copy.title}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{copy.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPlans}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-stone-200 dark:border-stone-700 hover:border-teal-500/60 transition-colors"
          >
            {copy.reload}
          </button>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
            <X size={20} className="text-stone-400" />
          </button>
        </div>
      </div>

      <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-4">
        {source === 'provider' ? copy.sourceProvider : copy.sourceFallback}
      </p>

      {loading ? (
        <div className="py-20 text-center">
          <Loader2 className="animate-spin mx-auto mb-3 text-teal-600" />
          <p className="text-sm text-stone-500">{copy.loading}</p>
        </div>
      ) : plans.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-sm text-stone-500">{copy.noPlans}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-stone-100 dark:border-stone-700 p-5 bg-stone-50 dark:bg-stone-800/50">
              <p className="text-[10px] uppercase tracking-widest font-bold text-teal-600 dark:text-teal-400 mb-1">{plan.country}</p>
              <h4 className="font-bold text-stone-900 dark:text-white">{plan.name}</h4>
              <div className="mt-3 space-y-1 text-sm text-stone-500 dark:text-stone-400">
                <p><span className="font-bold text-stone-700 dark:text-stone-200">{plan.data}</span></p>
                <p>{plan.validityDays} {copy.day}</p>
                <p className="font-mono font-bold text-stone-900 dark:text-white">${plan.priceUsd.toFixed(2)} {plan.currency}</p>
              </div>
              <button
                onClick={() => openPaymentSheet(plan)}
                disabled={loadingPlanId === plan.id}
                className="mt-4 w-full bg-teal-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loadingPlanId === plan.id ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                {copy.buy}
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selectedPlan && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlan(null)}
              className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 14 }}
              className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl"
            >
              <div className="flex items-start justify-between mb-7">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedPlan(null)}
                    className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    <ChevronLeft size={24} className="text-stone-400" />
                  </button>
                  <div>
                    <h4 className="text-xl sm:text-3xl font-serif text-stone-900 dark:text-white">{copy.paymentTitle}</h4>
                    <p className="text-xs uppercase tracking-[0.18em] font-black text-stone-400 dark:text-stone-500 mt-1">
                      {copy.paymentSubtitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <X size={24} className="text-stone-400" />
                </button>
              </div>

              <div className="rounded-3xl border border-stone-100 dark:border-stone-800 p-6 sm:p-7 bg-stone-50/70 dark:bg-stone-800/50 mb-7">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg sm:text-2xl font-bold text-stone-600 dark:text-stone-300">{copy.totalAmount}</p>
                    <p className="text-sm sm:text-lg text-stone-400 dark:text-stone-500 mt-4">
                      {copy.packageLabel}: {selectedPlan.name} ({selectedPlan.validityDays} {copy.day}) ({selectedPlan.data})
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl sm:text-5xl font-black text-stone-900 dark:text-white">{formatNumber(toJpy(selectedPlan))} JPY</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
                      {copy.estimatedLabel}: {selectedPlan.priceUsd.toFixed(2)} {selectedPlan.currency}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs uppercase tracking-[0.18em] font-black text-stone-400 dark:text-stone-500 mb-3">
                {copy.selectMethod}
              </p>
              <div className="space-y-3 mb-7">
                {paymentMethods.map((method) => (
                  <button
                    key={method.key}
                    onClick={() => setSelectedPaymentMethod(method.key)}
                    className={`w-full rounded-2xl border p-5 flex items-center gap-4 transition-colors text-left ${
                      selectedPaymentMethod === method.key
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                        : 'border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-stone-700 dark:text-stone-200'
                    }`}
                  >
                    <span className="text-stone-400 dark:text-stone-300">{method.icon}</span>
                    <span className="text-base sm:text-2xl font-bold">{method.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={handleConfirmPayment}
                disabled={loadingPlanId === selectedPlan.id}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-2xl text-base sm:text-lg font-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loadingPlanId === selectedPlan.id ? <Loader2 className="animate-spin w-5 h-5" /> : null}
                {loadingPlanId === selectedPlan.id ? copy.processing : copy.payNow}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

type UpgradePlanId = 'free' | 'basic' | 'pro' | 'ultra';

const UpgradeModal = ({ onClose, language }: { onClose: () => void; language: Language }) => {
  const supportEmail = 'lovejapan12345@gmail.com';
  const copyByLang = {
    vi: {
      title: 'Nâng cấp gói',
      subtitle: 'Nhận thêm câu hỏi và tính năng',
      questionsLeft: 'Câu hỏi còn lại',
      currentPlan: 'Gói hiện tại',
      upgradeNow: 'Nâng cấp ngay',
      processing: 'Đang xử lý...',
      free: 'Miễn phí',
      basic: 'Cơ bản',
      pro: 'Chuyên nghiệp',
      ultra: 'Cao cấp',
      autoPayNotice: 'Đang mở cổng thanh toán...',
      autoPayHint: 'Nếu cổng thanh toán không mở, vui lòng dùng nút Email hỗ trợ bên dưới.',
      checkoutMissing: 'Gói này chưa có link thanh toán trực tiếp.',
      contactSupport: 'Liên hệ qua Email',
      payoutHint: 'Cấu hình link checkout qua VITE_CHECKOUT_BASIC_URL / VITE_CHECKOUT_PRO_URL / VITE_CHECKOUT_ULTRA_URL.'
    },
    en: {
      title: 'Upgrade Plan',
      subtitle: 'Get more questions and premium utilities',
      questionsLeft: 'questions left',
      currentPlan: 'Current Plan',
      upgradeNow: 'Upgrade Now',
      processing: 'Processing...',
      free: 'Free',
      basic: 'Basic',
      pro: 'Pro',
      ultra: 'Ultra',
      autoPayNotice: 'Opening checkout...',
      autoPayHint: 'If checkout did not open, use support email below.',
      checkoutMissing: 'No direct checkout URL configured for this tier.',
      contactSupport: 'Contact via Email',
      payoutHint: 'Configure checkout links via VITE_CHECKOUT_BASIC_URL / VITE_CHECKOUT_PRO_URL / VITE_CHECKOUT_ULTRA_URL.'
    },
    ja: {
      title: 'プランをアップグレード',
      subtitle: '質問枠と機能を増やす',
      questionsLeft: '残り質問数',
      currentPlan: '現在のプラン',
      upgradeNow: '今すぐアップグレード',
      processing: '処理中...',
      free: '無料',
      basic: 'ベーシック',
      pro: 'プロ',
      ultra: 'プレミアム',
      autoPayNotice: '決済ページを開いています...',
      autoPayHint: '決済ページが開かない場合は、下のサポートメールをご利用ください。',
      checkoutMissing: 'このプランの決済URLが未設定です。',
      contactSupport: 'メールで問い合わせ',
      payoutHint: 'VITE_CHECKOUT_BASIC_URL / VITE_CHECKOUT_PRO_URL / VITE_CHECKOUT_ULTRA_URL を設定してください。'
    }
  } as const;

  const copy = copyByLang[language];
  const buildBasicCheckout = (import.meta as any).env?.VITE_CHECKOUT_BASIC_URL || '';
  const buildProCheckout = (import.meta as any).env?.VITE_CHECKOUT_PRO_URL || '';
  const buildUltraCheckout = (import.meta as any).env?.VITE_CHECKOUT_ULTRA_URL || '';
  const [runtimeCheckout, setRuntimeCheckout] = useState<{ basic: string; pro: string; ultra: string }>({
    basic: '',
    pro: '',
    ultra: ''
  });
  const [processingPlanId, setProcessingPlanId] = useState<UpgradePlanId | null>(null);
  const [showPayNotice, setShowPayNotice] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<UpgradePlanId>('free');

  const checkoutByPlan = {
    basic: runtimeCheckout.basic || buildBasicCheckout,
    pro: runtimeCheckout.pro || buildProCheckout,
    ultra: runtimeCheckout.ultra || buildUltraCheckout || runtimeCheckout.pro || buildProCheckout
  };

  useEffect(() => {
    const savedPlan = typeof window !== 'undefined' ? window.localStorage.getItem('olachill_plan') : null;
    if (savedPlan === 'free' || savedPlan === 'basic' || savedPlan === 'pro' || savedPlan === 'ultra') {
      setCurrentPlan(savedPlan);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/public-config')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((json) => {
        if (!active || !json) return;
        setRuntimeCheckout({
          basic: typeof json?.checkoutBasicUrl === 'string' ? json.checkoutBasicUrl : '',
          pro: typeof json?.checkoutProUrl === 'string' ? json.checkoutProUrl : '',
          ultra: typeof json?.checkoutUltraUrl === 'string' ? json.checkoutUltraUrl : ''
        });
      })
      .catch(() => {
        // Ignore fetch errors and fallback to build-time env.
      });

    return () => {
      active = false;
    };
  }, []);

  const openCheckout = (url: string) => {
    if (!url) return false;
    const ua = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
    const isMobile = /android|iphone|ipad|ipod|mobile/i.test(ua);

    try {
      if (isMobile) {
        window.location.assign(url);
        return true;
      }
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        window.location.assign(url);
      }
      return true;
    } catch (error) {
      console.error('Failed to open checkout URL', error);
      return false;
    }
  };

  const openSupportEmail = () => {
    const body = language === 'vi'
      ? 'Xin chào Olachill, tôi cần hỗ trợ nâng cấp gói.'
      : language === 'ja'
        ? 'Olachill様、プランアップグレードのサポートをお願いします。'
        : 'Hi Olachill, I need support to upgrade my plan.';
    const mailto = `mailto:${supportEmail}?subject=Plan Upgrade Request&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const plans: Array<{ id: UpgradePlanId; name: string; price: string; limit: number; features?: string[] }> = [
    { id: 'free', name: copy.free, price: '0 ¥', limit: 10 },
    { id: 'basic', name: copy.basic, price: '500 ¥', limit: 50 },
    { id: 'pro', name: copy.pro, price: '1000 ¥', limit: 100 },
    { id: 'ultra', name: copy.ultra, price: '2000 ¥', limit: 200, features: ['GPS nearby search'] }
  ];

  const handleUpgrade = (planId: UpgradePlanId) => {
    if (planId === 'free' || processingPlanId) return;
    setShowPayNotice(false);
    setProcessingPlanId(planId);

    const checkoutUrl = checkoutByPlan[planId as keyof typeof checkoutByPlan];
    const opened = openCheckout(checkoutUrl);
    if (!opened) {
      setProcessingPlanId(null);
      alert(copy.checkoutMissing);
      return;
    }

    setShowPayNotice(true);
    setTimeout(() => {
      setProcessingPlanId(null);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        className="relative w-full max-w-6xl max-h-[92vh] overflow-y-auto bg-white dark:bg-stone-900 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 p-5 sm:p-8 shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={18} className="text-stone-400" />
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Crown size={20} />
          </div>
          <h3 className="text-2xl font-serif dark:text-white">{copy.title}</h3>
        </div>
        <p className="text-sm text-stone-500 dark:text-stone-400 mb-5">{copy.subtitle}</p>

        {showPayNotice && (
          <div className="mb-6 rounded-2xl border border-emerald-100 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4">
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{copy.autoPayNotice}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{copy.autoPayHint}</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isProcessing = processingPlanId === plan.id;
            const disabled = isCurrent || processingPlanId !== null;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-5 transition-colors ${
                  isCurrent
                    ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10'
                    : 'border-stone-200 dark:border-stone-700 bg-stone-50/40 dark:bg-stone-800/40'
                }`}
              >
                <h4 className="text-lg font-bold dark:text-white">{plan.name}</h4>
                <p className="text-4xl font-black text-emerald-600 dark:text-emerald-400 mt-2 mb-4">{plan.price}</p>
                <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-300 mb-5 min-h-20">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={14} className="mt-0.5 text-emerald-500" />
                    <span>{plan.limit} {copy.questionsLeft}</span>
                  </li>
                  {(plan.features || []).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={disabled}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 ${
                    isCurrent
                      ? 'bg-stone-200 dark:bg-stone-800 text-stone-500 cursor-default'
                      : 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-80 disabled:cursor-not-allowed'
                  }`}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : isCurrent ? <CheckCircle2 size={14} /> : <ArrowRight size={14} />}
                  <span>{isCurrent ? copy.currentPlan : isProcessing ? copy.processing : copy.upgradeNow}</span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={openSupportEmail}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <ExternalLink size={14} />
            <span>{copy.contactSupport}</span>
          </button>
          <p className="text-xs text-stone-400 dark:text-stone-500">{copy.payoutHint}</p>
        </div>
      </motion.div>
    </div>
  );
};

const ItineraryCard = ({ day, onLocationClick, t }: { day: any, onLocationClick: (loc: string) => void, t: any }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md transition-all mb-4"
  >
    <div className="flex items-center gap-4 mb-6">
      <div className="w-12 h-12 bg-stone-900 dark:bg-stone-100 rounded-2xl flex items-center justify-center text-white dark:text-stone-900 font-serif italic text-xl">
        {day.day}
      </div>
      <div>
        <h3 className="font-serif text-xl text-stone-900 dark:text-white">{t.day} {day.day}: {day.title}</h3>
        <p className="text-stone-400 dark:text-stone-500 text-sm uppercase tracking-widest font-medium">{t.discoveryJourney}</p>
      </div>
    </div>

    <div className="space-y-6 relative before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-stone-100 dark:before:bg-stone-800">
      {day.activities.map((activity: any, idx: number) => (
        <div key={idx} className="relative pl-12 group">
          <div className="absolute left-0 top-1.5 w-10 h-10 bg-white dark:bg-stone-900 border-4 border-stone-50 dark:border-stone-800 rounded-full flex items-center justify-center z-10 group-hover:border-emerald-50 dark:group-hover:border-emerald-900/30 transition-colors">
            <div className="w-2 h-2 bg-stone-300 dark:bg-stone-700 rounded-full group-hover:bg-emerald-500 transition-colors" />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 mb-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-md w-fit">
              {activity.time}
            </span>
            {activity.googleMapsUrl && (
              <a 
                href={activity.googleMapsUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[10px] flex items-center gap-1 text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold uppercase tracking-tighter"
              >
                <MapIcon size={10} />
                <span>Google Maps</span>
              </a>
            )}
            <button 
              onClick={() => onLocationClick(activity.location)}
              className="text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:white transition-colors flex items-center gap-1 text-xs font-medium"
            >
              <span className="dark:text-stone-400"><Info size={14} /></span>
              <span>{t.details}</span>
            </button>
          </div>
          <h4 
            onClick={() => onLocationClick(activity.location)}
            className="font-medium text-stone-900 dark:text-stone-100 cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {activity.activity} - {activity.location}
          </h4>
          <p className="text-stone-500 dark:text-stone-400 text-sm leading-relaxed mt-1">{activity.description}</p>
        </div>
      ))}
    </div>
  </motion.div>
);

const TravelPlanDisplay = ({ 
  plan, 
  onLocationClick, 
  onSuggestionClick,
  t
}: { 
  plan: TravelPlan, 
  onLocationClick: (loc: string) => void,
  onSuggestionClick: (suggestion: string) => void,
  t: any
}) => {
  const [activeTab, setActiveTab] = useState<'itinerary' | 'explorer' | 'events' | 'transport'>(() => {
    // Default to the first available tab
    if (plan.type === 'chat' || !plan.days || plan.days.length === 0) return 'itinerary';
    return 'itinerary';
  });
  const [ticketSort, setTicketSort] = useState<'none' | 'price-asc' | 'price-desc' | 'name'>('none');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<'all' | 'ticket' | 'transport'>('all');
  const [ticketSearch, setTicketSearch] = useState('');

  // Helper to extract numeric price for sorting
  const getNumericPrice = (priceStr: string) => {
    if (!priceStr) return 0;
    const cleaned = priceStr.replace(/[^\d]/g, '');
    return cleaned ? parseInt(cleaned, 10) : 0;
  };

  // Combine and filter tickets/transportation
  const combinedItems = [
    ...(plan.tickets || []).map(t => ({ ...t, category: 'ticket' as const, title: t.name, info: t.bookingPoint, desc: t.note })),
    ...(plan.transportation || []).map(t => ({ ...t, category: 'transport' as const, title: `${t.type} - ${t.provider}`, info: t.provider, desc: t.details }))
  ];

  const filteredItems = combinedItems
    .filter(item => {
      const matchesType = ticketTypeFilter === 'all' || item.category === ticketTypeFilter;
      const matchesSearch = item.title.toLowerCase().includes(ticketSearch.toLowerCase()) || 
                           item.desc.toLowerCase().includes(ticketSearch.toLowerCase());
      return matchesType && matchesSearch;
    })
    .sort((a, b) => {
      if (ticketSort === 'name') return a.title.localeCompare(b.title);
      if (ticketSort === 'price-asc') return getNumericPrice(a.price) - getNumericPrice(b.price);
      if (ticketSort === 'price-desc') return getNumericPrice(b.price) - getNumericPrice(a.price);
      return 0;
    });

  return (
    <div className="w-full">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <h2 className="text-4xl font-serif text-stone-900 dark:text-white tracking-tight">{plan.destination}</h2>
          <div className="flex bg-stone-100 dark:bg-stone-800 p-1 rounded-xl w-fit h-fit">
            <button 
              onClick={() => setActiveTab('itinerary')}
              className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'itinerary' ? 'bg-white dark:bg-stone-700 shadow-md text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'}`}
            >
              {plan.type === 'chat' ? t.answer : t.itinerary}
            </button>
            {(plan.tickets && plan.tickets.length > 0 || plan.transportation && plan.transportation.length > 0) && (
              <button 
                onClick={() => setActiveTab('transport')}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'transport' ? 'bg-white dark:bg-stone-700 shadow-md text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'}`}
              >
                {t.transportTickets}
              </button>
            )}
            {(plan.events && plan.events.length > 0) && (
              <button 
                onClick={() => setActiveTab('events')}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'events' ? 'bg-white dark:bg-stone-700 shadow-md text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300'}`}
              >
                {t.events}
              </button>
            )}
          </div>
        </div>
      </div>

      {activeTab === 'itinerary' && (
        <div className="space-y-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 p-8 rounded-[32px] shadow-sm relative overflow-hidden"
          >
            {plan.type === 'chat' && (
              <div className="absolute top-0 right-0 p-4 opacity-5">
                <Bot size={120} />
              </div>
            )}
            <div className="prose prose-stone dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:text-stone-800 dark:prose-p:text-stone-200 prose-headings:font-serif prose-li:text-stone-700 dark:prose-li:text-stone-300 prose-a:text-emerald-600 dark:prose-a:text-emerald-400 prose-a:no-underline hover:prose-a:underline prose-a:font-bold prose-ul:list-disc prose-li:my-1">
              <ReactMarkdown 
                components={{
                  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                }}
              >
                {plan.summary}
              </ReactMarkdown>
            </div>
          </motion.div>

          {plan.type === 'plan' && plan.itinerarySummary && plan.itinerarySummary.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-100 dark:border-stone-800 shadow-sm overflow-hidden"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                  <Calendar className="text-emerald-600 dark:text-emerald-400" size={18} />
                </div>
                <h3 className="text-lg font-serif dark:text-white">{t.itinerarySummary}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-stone-100 dark:border-stone-800">
                      <th className="py-3 px-4 font-bold text-stone-900 dark:text-white">{t.day}</th>
                      <th className="py-3 px-4 font-bold text-stone-900 dark:text-white">{t.mainArea}</th>
                      <th className="py-3 px-4 font-bold text-stone-900 dark:text-white">{t.experienceFocus}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.itinerarySummary.map((item, idx) => (
                      <tr key={idx} className="border-b border-stone-50 dark:border-stone-800/50 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">{item.day}</td>
                        <td className="py-3 px-4 text-stone-700 dark:text-stone-300">{item.area}</td>
                        <td className="py-3 px-4 text-stone-600 dark:text-stone-400 italic">{item.focus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {plan.type === 'plan' && (
            <div className="space-y-4">
              {(plan.days || []).map((day) => (
                <ItineraryCard key={day.day} day={day} onLocationClick={onLocationClick} t={t} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'transport' && (
        <div className="space-y-8">
          {combinedItems.length > 0 ? (
            <div className="bg-white dark:bg-stone-900 rounded-3xl p-8 border border-stone-100 dark:border-stone-800 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Ticket size={24} />
                  </div>
                  <h3 className="text-xl font-serif dark:text-white">{t.ticketsTransport}</h3>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={14} />
                    <input 
                      type="text"
                      placeholder={t.searchPlaceholder}
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value)}
                      className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white w-40"
                    />
                  </div>

                  <select 
                    value={ticketTypeFilter}
                    onChange={(e) => setTicketTypeFilter(e.target.value as any)}
                    className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white"
                  >
                    <option value="all">{t.allTypes}</option>
                    <option value="ticket">{t.sightseeingTickets}</option>
                    <option value="transport">{t.transport}</option>
                  </select>
                  
                  <select 
                    value={ticketSort}
                    onChange={(e) => setTicketSort(e.target.value as any)}
                    className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:text-white"
                  >
                    <option value="none">{t.sortBy}</option>
                    <option value="price-asc">{t.priceLowToHigh}</option>
                    <option value="price-desc">{t.priceHighToLow}</option>
                    <option value="name">{t.nameAZ}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-6">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item, i) => (
                    <div key={i} className="border-b border-stone-50 dark:border-stone-800 last:border-0 pb-4 last:pb-0 group">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                              item.category === 'ticket' 
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' 
                                : 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'
                            }`}>
                              {item.category === 'ticket' ? t.ticket : t.transport}
                            </span>
                            <h4 className="font-bold text-stone-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {item.title}
                            </h4>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400 dark:text-stone-500 mt-1 mb-2">
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{item.price}</span>
                            <span className="mx-1">•</span>
                            <span>{item.category === 'ticket' ? t.buyAt : t.provider} {item.info}</span>
                          </div>
                          <p className="text-stone-500 dark:text-stone-400 text-xs leading-relaxed italic">{item.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
              <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2">{t.noItemsFound}</h3>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 bg-stone-50 dark:bg-stone-900/50 rounded-3xl border border-dashed border-stone-200 dark:border-stone-800">
              <div className="inline-flex p-4 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-400 dark:text-stone-600 mb-4">
                <Car size={32} />
              </div>
              <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2">{t.noTransportInfo}</h3>
              <p className="text-stone-500 dark:text-stone-400 max-w-xs mx-auto">{t.askAiTransport.replace('{destination}', plan.destination)}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'events' && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-400">
              <PartyPopper size={24} />
            </div>
            <div>
              <h3 className="text-xl font-serif dark:text-white">Sự kiện & Lễ hội thời gian thực</h3>
              <p className="text-xs text-stone-400 dark:text-stone-500">Cập nhật mới nhất cho chuyến đi của bạn</p>
            </div>
          </div>

          {plan.events && plan.events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {plan.events.map((event, idx) => (
                <div key={idx} className="bg-white dark:bg-stone-900 rounded-3xl p-6 border border-stone-100 dark:border-stone-800 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-2xl text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                      <PartyPopper size={24} />
                    </div>
                    <span className="px-3 py-1 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 text-[10px] font-bold uppercase tracking-wider rounded-full">
                      {event.type}
                    </span>
                  </div>
                  <h3 className="text-lg font-serif text-stone-900 dark:text-white mb-2">{event.name}</h3>
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                      <Calendar size={14} className="text-emerald-500" />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                      <MapPin size={14} className="text-emerald-500" />
                      <span>{event.location}</span>
                    </div>
                  </div>
                  <p className="text-stone-600 dark:text-stone-400 text-sm leading-relaxed">{event.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-stone-50 dark:bg-stone-900/50 rounded-3xl border border-dashed border-stone-200 dark:border-stone-800">
              <div className="inline-flex p-4 bg-stone-100 dark:bg-stone-800 rounded-full text-stone-400 dark:text-stone-600 mb-4">
                <Music size={32} />
              </div>
              <h3 className="text-lg font-medium text-stone-900 dark:text-white mb-2">{t.noEventsFound}</h3>
              <p className="text-stone-500 dark:text-stone-400 max-w-xs mx-auto">{t.noMajorEvents.replace('{destination}', plan.destination)}</p>
            </div>
          )}
        </motion.div>
      )}

      {plan.suggestions && plan.suggestions.length > 0 && (
        <div className="mt-8 pt-8 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2 mb-4">
            <Compass size={16} className="text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">{t.suggestionsForYou}</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {plan.suggestions.map((item, i) => (
              <button
                key={i}
                onClick={() => onSuggestionClick(item.query)}
                className="group p-3 bg-stone-50/50 dark:bg-stone-800/30 border border-stone-100 dark:border-stone-800 rounded-xl hover:border-emerald-500/30 dark:hover:border-emerald-400/30 hover:bg-white dark:hover:bg-stone-800 transition-all text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 shrink-0 bg-white dark:bg-stone-900 rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-stone-900 dark:text-white text-sm truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-stone-500 dark:text-stone-400 line-clamp-1">
                    {item.description}
                  </p>
                </div>
                <ArrowRight size={14} className="text-stone-300 dark:text-stone-600 group-hover:text-emerald-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Application ---

const AppContent = ({ language, setLanguage }: { language: Language, setLanguage: React.Dispatch<React.SetStateAction<Language>> }) => {
  const [prompt, setPrompt] = useState('');
  const [headerSearch, setHeaderSearch] = useState('');
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const t = translations[language];
  const languageOptions: { code: Language; label: string }[] = [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' }
  ];
  const mobileMenuVersionLabel = 'V1.1.3-JP';
  const aboutLabel = language === 'vi' ? 'Giới thiệu' : language === 'ja' ? '紹介' : 'About';
  const esimPaymentLabel = language === 'vi' ? 'Thanh toán eSIM' : language === 'ja' ? 'eSIM決済' : 'eSIM Payment';
  const sessionsStorageKey = 'olachill_sessions';
  const legacySessionsStorageKey = 'japan_ai_sessions';
  const aiProcessingLabel = language === 'vi' ? `${t.appName} đang xử lý...` : language === 'ja' ? `${t.appName} が処理中...` : `${t.appName} is processing...`;
  const aiOptimizingLabel = language === 'vi' ? 'Đang tối ưu hóa lịch trình' : language === 'ja' ? '旅程を最適化中' : 'Optimizing itinerary';
  const processingSteps = language === 'vi'
    ? ['Tìm kiếm địa điểm', 'Tính toán chi phí', 'Kiểm tra sự kiện', 'Tối ưu hóa bản đồ']
    : language === 'ja'
      ? ['スポット検索', '費用計算', 'イベント確認', '地図最適化']
      : ['Searching places', 'Calculating cost', 'Checking events', 'Optimizing map'];

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [locationInfo, setLocationInfo] = useState<{ text: string, grounding?: any } | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [showSavedPlans, setShowSavedPlans] = useState(false);

  // Suggested topics based on popular queries and AI strengths
  const suggestedTopics = t.suggestedTopics;

  const [activeUtility, setActiveUtility] = useState<null | 'train' | 'bus' | 'tickets' | 'cafe' | 'secondhand' | 'personalization' | 'esim'>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userPrefs, setUserPrefs] = useState<any>(null);

  const getLoginErrorMessage = (error: any) => {
    const code = String(error?.code || '');
    if (language === 'vi') {
      if (code === 'auth/unauthorized-domain') return 'Domain này chưa được bật trong Firebase Auth. Hãy thêm olachill.com vào Authorized domains.';
      if (code === 'auth/operation-not-allowed') return 'Google Sign-In chưa bật trong Firebase Authentication.';
      if (code === 'auth/invalid-api-key') return 'Firebase API key không hợp lệ.';
      if (code === 'auth/network-request-failed') return 'Lỗi mạng khi đăng nhập. Vui lòng thử lại.';
      return 'Đăng nhập thất bại. Vui lòng thử lại.';
    }
    if (language === 'ja') {
      if (code === 'auth/unauthorized-domain') return 'Firebase Auth の許可ドメインにこのドメインが未登録です。olachill.com を追加してください。';
      if (code === 'auth/operation-not-allowed') return 'Firebase Authentication で Google ログインが有効化されていません。';
      if (code === 'auth/invalid-api-key') return 'Firebase API キーが無効です。';
      if (code === 'auth/network-request-failed') return 'ネットワークエラーのためログインできません。';
      return 'ログインに失敗しました。再試行してください。';
    }
    if (code === 'auth/unauthorized-domain') return 'This domain is not authorized in Firebase Auth. Add olachill.com to Authorized domains.';
    if (code === 'auth/operation-not-allowed') return 'Google Sign-In is not enabled in Firebase Authentication.';
    if (code === 'auth/invalid-api-key') return 'Invalid Firebase API key.';
    if (code === 'auth/network-request-failed') return 'Network error while signing in. Please try again.';
    return 'Login failed. Please try again.';
  };

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
      alert(getLoginErrorMessage(error));
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Preferences Listener
  useEffect(() => {
    if (user) {
      const unsub = onSnapshot(doc(db, 'users', user.uid, 'preferences', 'main'), (docSnap: any) => {
        if (docSnap.exists()) {
          setUserPrefs(docSnap.data());
        }
      });
      return () => unsub();
    } else {
      setUserPrefs(null);
    }
  }, [user]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsReady(true);
    // Load saved sessions
    const saved = localStorage.getItem(sessionsStorageKey) || localStorage.getItem(legacySessionsStorageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert string timestamps back to Date objects
        const sessions = parsed.map((s: any) => ({
          ...s,
          messages: s.messages.map((m: any) => ({
            ...m,
            timestamp: new Date(m.timestamp)
          }))
        }));
        setSavedSessions(sessions);
        localStorage.setItem(sessionsStorageKey, JSON.stringify(sessions));
        if (localStorage.getItem(legacySessionsStorageKey)) {
          localStorage.removeItem(legacySessionsStorageKey);
        }
      } catch (e) {
        console.error("Error loading saved sessions:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isReady) {
      localStorage.setItem(sessionsStorageKey, JSON.stringify(savedSessions));
    }
  }, [savedSessions, isReady, sessionsStorageKey]);

  const saveCurrentSession = () => {
    if (messages.length === 0) return;
    
    // Find the first user message or AI plan title for the session title
    const firstUserMsg = messages.find(m => m.type === 'user')?.content || 'Chuyến đi mới';
    const title = firstUserMsg.length > 30 ? firstUserMsg.substring(0, 30) + '...' : firstUserMsg;
    
    const newSession: SavedSession = {
      id: Date.now().toString(),
      title,
      messages: [...messages],
      timestamp: Date.now()
    };
    
    setSavedSessions(prev => [newSession, ...prev]);
    // Use a custom toast or just translations for alert
    alert(t.saved);
  };

  const loadSession = (session: SavedSession) => {
    setMessages(session.messages);
    setShowSavedPlans(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t.confirmDelete)) {
      setSavedSessions(prev => prev.filter(s => s.id !== id));
    }
  };

  const clearChat = () => {
    if (messages.length > 0 && confirm(t.confirmNewChat)) {
      setMessages([]);
    }
  };

  const scrollToSectionFromMenu = (id: string) => {
    setShowMobileMenu(false);
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 140);
  };

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const generatePlan = async (userPrompt: string) => {
    if (!userPrompt.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: userPrompt,
      timestamp: new Date()
    };

    const loadingMessage: Message = {
      id: (Date.now() + 1).toString(),
      type: 'loading',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setLoading(true);
    setPrompt('');

    if (!user) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        return [...filtered, {
          id: Date.now().toString(),
          type: 'error',
          content: t.errorLoginRequired,
          timestamp: new Date()
        }];
      });
      setLoading(false);
      return;
    }

    try {
      // Build history for AI
      const history = messages
        .filter(m => m.type === 'user' || m.type === 'ai')
        .map(m => ({
          role: m.type === 'user' ? 'user' as const : 'model' as const,
          text: m.type === 'user' ? m.content || '' : JSON.stringify(m.plan)
        }));

      // Add a timeout for the AI generation
      const generationPromise = generateTravelPlan(userPrompt, user?.uid, user?.email, history, (text) => {
        setMessages(prev => {
          // Optimization: Only update the last message if it's the loading one
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].id === loadingMessage.id) {
            const newMessages = [...prev];
            newMessages[lastIdx] = {
              ...newMessages[lastIdx],
              streamingText: text
            };
            return newMessages;
          }
          return prev;
        });
      }, language);
      
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(t.errorTimeout)), 120000)
      );

      const result = await Promise.race([generationPromise, timeoutPromise]);
      
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== 'loading');
        return [...filtered, {
          id: Date.now().toString(),
          type: 'ai',
          plan: result,
          timestamp: new Date()
        }];
      });
    } catch (err) {
      console.error("Plan generation error:", err);
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== 'loading');
        return [...filtered, {
          id: Date.now().toString(),
          type: 'error',
          content: err instanceof Error ? err.message : t.errorGeneral,
          timestamp: new Date()
        }];
      });
    } finally {
      setLoading(false);
    }
  };

  const regeneratePlan = async (userPrompt: string) => {
    if (!userPrompt.trim() || loading) return;
    
    // Remove last AI message and its corresponding loading if any
    setMessages(prev => {
      const newMessages = [...prev];
      if (newMessages.length > 0 && newMessages[newMessages.length - 1].type === 'ai') {
        newMessages.pop();
      }
      return newMessages;
    });
    
    generatePlan(userPrompt);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    generatePlan(prompt);
  };

  const handleSuggestionClick = (suggestion: string) => {
    generatePlan(suggestion);
  };

  const handleLocationClick = async (location: string) => {
    setSelectedLocation(location);
    setLoadingInfo(true);
    try {
      const info = await getPlaceInfo(location, language);
      setLocationInfo(info);
    } catch (err) {
      console.error(err);
      setLocationInfo({ text: t.errorNoInfo });
    } finally {
      setLoadingInfo(false);
    }
  };

  if (!isReady) return <SplashScreen language={language} />;

  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans flex flex-col transition-colors duration-300 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 h-20 bg-white/85 dark:bg-stone-900/85 backdrop-blur-md z-50 border-b border-stone-100 dark:border-stone-800 px-4 md:px-6 flex items-center justify-between overflow-x-hidden">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setShowMobileMenu(true)}
            className="md:hidden p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors"
            title="Menu"
          >
            <Menu size={22} />
          </button>
          <div className="w-11 h-11 bg-gradient-to-br from-sky-100 to-lime-100 dark:from-stone-900 dark:to-stone-800 rounded-2xl flex items-center justify-center border border-emerald-100 dark:border-stone-700 p-1.5 shadow-sm">
            <OlachillLogo className="w-full h-full" />
          </div>
          <span className="hidden md:inline font-serif italic text-2xl tracking-tight dark:text-white">{t.appName}</span>
          <span className="md:hidden inline-flex items-center px-3 py-1 rounded-xl bg-emerald-100 text-emerald-700 text-sm font-black tracking-wide border border-emerald-200">
            NEW
          </span>
        </div>

        {/* Header Search Bar */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (headerSearch.trim()) {
                generatePlan(headerSearch);
                setHeaderSearch('');
              }
            }}
            className="relative w-full group"
          >
            <input 
              type="text" 
              value={headerSearch}
              onChange={(e) => setHeaderSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl py-2.5 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 group-focus-within:text-emerald-500 transition-colors" size={18} />
          </form>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={() => setShowMobileSearch(!showMobileSearch)}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors"
              title={t.searchPlaceholder}
            >
              {showMobileSearch ? <X size={20} /> : <Search size={20} />}
            </button>
            <button
              onClick={saveCurrentSession}
              disabled={messages.length === 0}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={t.save}
            >
              <Save size={20} />
            </button>
            <button
              onClick={clearChat}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors"
              title={t.newChat}
            >
              <Plus size={20} />
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2">
            {messages.length > 0 && (
              <>
                <button 
                  onClick={saveCurrentSession}
                  className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors flex items-center gap-2 text-sm"
                  title={t.save}
                >
                  <Save size={20} />
                  <span className="hidden sm:inline">{t.save}</span>
                </button>
                <button 
                  onClick={clearChat}
                  className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors flex items-center gap-2 text-sm"
                  title={t.newChat}
                >
                  <Plus size={20} />
                  <span className="hidden sm:inline">{t.newChat}</span>
                </button>
              </>
            )}
            <button 
              onClick={() => setShowSavedPlans(true)}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors flex items-center gap-2 text-sm"
              title={t.history}
            >
              <History size={20} />
              <span className="hidden sm:inline">{t.history}</span>
            </button>
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors flex items-center gap-2 text-sm"
              title={t.pricing}
            >
              <Crown size={18} />
              <span className="hidden sm:inline">{t.pricing}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowLanguageMenu((prev) => !prev)}
                className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors font-bold text-xs uppercase border border-stone-200 dark:border-stone-800"
                title="Language"
              >
                {language}
              </button>

              <AnimatePresence>
                {showLanguageMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.98 }}
                    className="absolute right-0 mt-2 w-[240px] bg-white/95 dark:bg-stone-900/95 border border-stone-200 dark:border-stone-800 rounded-2xl p-2 shadow-2xl backdrop-blur-md z-[60]"
                  >
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {languageOptions.map((item) => (
                        <button
                          key={item.code}
                          onClick={() => {
                            setLanguage(item.code);
                            setShowLanguageMenu(false);
                          }}
                          className={`shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                            language === item.code
                              ? 'bg-emerald-600 text-white'
                              : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button 
              onClick={toggleTheme}
              className="p-2.5 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 rounded-xl transition-colors"
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>

            {user && userPrefs && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50 mr-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  {t.personalization.welcomeBack.replace('{name}', user.displayName?.split(' ')[0] || 'Traveler')}
                </span>
              </div>
            )}
            {authLoading ? (
              <div className="w-10 h-10 flex items-center justify-center">
                <Loader2 className="animate-spin text-stone-400" size={20} />
              </div>
            ) : user ? (
              <div className="flex items-center gap-3 pl-2 border-l border-stone-100 dark:border-stone-800">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">5 lượt/ngày</span>
                  <button 
                    onClick={logout}
                    className="text-[10px] font-bold text-stone-400 hover:text-red-500 transition-colors uppercase tracking-wider"
                  >
                    {t.logout}
                  </button>
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`} 
                  alt={user.displayName || 'User'} 
                  className="w-8 h-8 rounded-full border border-stone-200 dark:border-stone-700"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="ml-1 sm:ml-2 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 sm:gap-2 shrink-0"
              >
                <User size={18} />
                <span className="hidden sm:inline">{t.login}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar Menu */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 bg-black/25 backdrop-blur-[2px] z-[55] md:hidden"
            />
            <motion.aside
              initial={{ x: -360, opacity: 0.9 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -360, opacity: 0.9 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 bottom-0 w-[92vw] max-w-[360px] bg-white dark:bg-stone-900 z-[60] md:hidden border-r border-stone-200 dark:border-stone-800 flex flex-col"
            >
              <div className="p-6 border-b border-stone-100 dark:border-stone-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-100 to-lime-100 dark:from-stone-800 dark:to-stone-700 border border-emerald-100 dark:border-stone-700 p-2 shadow-sm">
                      <OlachillLogo className="w-full h-full" />
                    </div>
                    <div className="font-serif italic text-4xl leading-none text-stone-900 dark:text-white">{t.appName}</div>
                  </div>
                  <button
                    onClick={() => setShowMobileMenu(false)}
                    className="p-2 rounded-xl text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    <X size={26} />
                  </button>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <span className="text-sm font-black tracking-wide text-stone-400 dark:text-stone-500">{mobileMenuVersionLabel}</span>
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    window.open('https://olachill.com', '_blank', 'noopener,noreferrer');
                  }}
                  className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1 hover:underline"
                >
                  Visit olachill.com
                  <ExternalLink size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-8">
                <div className="mb-8">
                  <p className="text-xs font-black tracking-[0.28em] text-stone-400 dark:text-stone-500 uppercase mb-6">{t.product}</p>
                  <div className="space-y-3">
                    <button onClick={() => scrollToSectionFromMenu('footer-product')} className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1">{t.features}</button>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        setShowUpgradeModal(true);
                      }}
                      className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1"
                    >
                      {t.pricing}
                    </button>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        setActiveUtility('esim');
                      }}
                      className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1"
                    >
                      {esimPaymentLabel}
                    </button>
                    <button
                      onClick={() => {
                        setShowMobileMenu(false);
                        window.open('https://olachill.com', '_blank', 'noopener,noreferrer');
                      }}
                      className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1"
                    >
                      {t.downloadApp}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black tracking-[0.28em] text-stone-400 dark:text-stone-500 uppercase mb-6">{t.support}</p>
                  <div className="space-y-3">
                    <button onClick={() => scrollToSectionFromMenu('footer-support')} className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1">{t.helpCenter}</button>
                    <button onClick={() => scrollToSectionFromMenu('footer-about')} className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1">{aboutLabel}</button>
                    <button onClick={() => scrollToSectionFromMenu('footer-support')} className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1">{t.contact}</button>
                    <button onClick={() => scrollToSectionFromMenu('footer-support')} className="block w-full text-left text-[2.1rem] leading-[1.2] font-bold text-stone-700 dark:text-stone-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors py-1">{t.terms}</button>
                  </div>
                </div>
              </div>

              <div className="border-t border-stone-100 dark:border-stone-800 px-6 py-5">
                <p className="text-center text-sm text-stone-400 dark:text-stone-500">© 2026 {t.appName}. {t.allRightsReserved}</p>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile Search Overlay */}
      <AnimatePresence>
        {showMobileSearch && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileSearch(false)}
              className="fixed inset-0 bg-stone-950/20 backdrop-blur-[2px] z-[40] md:hidden"
            />
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-20 left-0 right-0 bg-white dark:bg-stone-900 z-[45] border-b border-stone-100 dark:border-stone-800 p-4 md:hidden"
            >
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (headerSearch.trim()) {
                  generatePlan(headerSearch);
                  setHeaderSearch('');
                  setShowMobileSearch(false);
                }
              }}
              className="relative w-full group"
            >
              <input 
                type="text" 
                autoFocus
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-2xl py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={20} />
            </form>
          </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Saved Plans Modal */}
      <AnimatePresence>
        {showSavedPlans && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSavedPlans(false)}
              className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-stone-900 rounded-[32px] shadow-2xl overflow-hidden border border-stone-100 dark:border-stone-800"
            >
              <div className="p-8 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-serif dark:text-white">{t.savedPlansTitle}</h2>
                  <p className="text-sm text-stone-400 dark:text-stone-500">{t.savedPlansSubtitle}</p>
                </div>
                <button 
                  onClick={() => setShowSavedPlans(false)}
                  className="p-2 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-full transition-colors text-stone-400"
                >
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {savedSessions.length === 0 ? (
                  <div className="py-12 text-center">
                    <div className="w-16 h-16 bg-stone-50 dark:bg-stone-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Folder className="text-stone-300 dark:text-stone-600 w-8 h-8" />
                    </div>
                    <p className="text-stone-400 dark:text-stone-500 italic">{t.noSavedPlans}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {savedSessions.map((session) => (
                      <div 
                        key={session.id}
                        onClick={() => loadSession(session)}
                        className="group flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-800 border border-transparent hover:border-stone-100 dark:hover:border-stone-700 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            <MapPin size={20} />
                          </div>
                          <div>
                            <h4 className="font-bold text-stone-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                              {session.title}
                            </h4>
                            <p className="text-xs text-stone-400 dark:text-stone-500">
                              {new Date(session.timestamp).toLocaleDateString(language === 'vi' ? 'vi-VN' : language === 'ja' ? 'ja-JP' : 'en-US', { 
                                day: 'numeric', 
                                month: 'long', 
                                year: 'numeric' 
                              })}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={(e) => deleteSession(session.id, e)}
                          className="p-2 text-stone-300 hover:text-red-500 dark:text-stone-600 dark:hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="p-6 bg-stone-50 dark:bg-stone-800/50 border-t border-stone-100 dark:border-stone-800">
                <p className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-widest text-center font-bold">
                  {t.localDataNote}
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="flex-1 pt-28 sm:pt-32 pb-32 px-4 sm:px-6 max-w-5xl mx-auto w-full relative overflow-x-hidden">
        {messages.length === 0 ? (
          /* Hero Section */
          <div className="flex flex-col items-center text-center py-12">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-3xl px-1 sm:px-0 overflow-x-hidden"
            >
              <h1 className="hidden md:block text-7xl font-serif leading-[1.1] mb-8 dark:text-white break-words [overflow-wrap:anywhere]">
                {t.heroTitle}
                {t.heroSubtitle ? (
                  <span className="block italic text-emerald-600 dark:text-emerald-400 mt-1">{t.heroSubtitle}</span>
                ) : null}
              </h1>

              <AnimatePresence mode="wait">
                {activeUtility ? (
                  <div className="flex justify-center mb-12">
                    {activeUtility === 'train' && (
                      <TrainSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                      />
                    )}
                    {activeUtility === 'bus' && (
                      <TrainSearch
                        onClose={() => setActiveUtility(null)}
                        language={language}
                        initialMode="bus"
                      />
                    )}
                    {activeUtility === 'tickets' && (
                      <TicketSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                      />
                    )}
                    {activeUtility === 'cafe' && (
                      <CafeSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                      />
                    )}
                    {activeUtility === 'secondhand' && (
                      <SecondHandSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                      />
                    )}
                    {activeUtility === 'personalization' && (
                      <Personalization 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                        user={user}
                        currentPrefs={userPrefs}
                      />
                    )}
                    {activeUtility === 'esim' && (
                      <EsimShop
                        onClose={() => setActiveUtility(null)}
                        language={language}
                      />
                    )}
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <div className="md:hidden w-full max-w-[430px] mx-auto">
                      <div className="rounded-[34px] bg-white/80 dark:bg-stone-900/80 border border-stone-100 dark:border-stone-800 shadow-2xl shadow-stone-100/80 dark:shadow-none px-5 py-7">
                        <div className="flex justify-center mb-7">
                          <div className="relative w-[188px] h-[188px]">
                            <div className="absolute top-0 left-0 w-[94px] h-[94px] rounded-full bg-gradient-to-br from-sky-400 to-cyan-300" />
                            <div className="absolute top-0 right-0 w-[94px] h-[94px] rounded-full bg-gradient-to-br from-emerald-400 to-lime-300" />
                            <div className="absolute bottom-0 left-0 w-[94px] h-[94px] rounded-full bg-gradient-to-br from-teal-300 to-cyan-200" />
                            <div className="absolute bottom-0 right-0 w-[94px] h-[94px] rounded-full bg-gradient-to-br from-emerald-300 to-yellow-200" />
                            <div className="absolute inset-[38px] rounded-3xl bg-white dark:bg-stone-900 border border-white/70 dark:border-stone-700 shadow-xl p-3">
                              <OlachillLogo className="w-full h-full" />
                            </div>
                          </div>
                        </div>

                        <h2 className="text-left text-[clamp(2rem,10vw,2.6rem)] leading-[1.06] font-black tracking-tight text-stone-900 dark:text-white mb-2 [overflow-wrap:anywhere]">
                          {t.heroTitle}
                        </h2>
                        {t.heroSubtitle ? (
                          <p className="text-left text-[clamp(1.45rem,7.2vw,2rem)] leading-[1.1] font-serif italic text-emerald-600 dark:text-emerald-400 mb-4 [overflow-wrap:anywhere]">
                            {t.heroSubtitle}
                          </p>
                        ) : null}
                        <p className="text-left text-stone-500 dark:text-stone-400 text-[15px] leading-relaxed mb-6">
                          {t.heroDescription}
                        </p>

                        <form onSubmit={handleFormSubmit} className="rounded-[30px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-xl shadow-stone-100 dark:shadow-none p-4">
                          <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={t.heroInputPlaceholder}
                            rows={3}
                            className="w-full resize-none bg-transparent outline-none text-[20px] leading-tight text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
                          />
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="w-10 h-10 rounded-full border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 flex items-center justify-center"
                              >
                                <Paperclip size={18} />
                              </button>
                              <button
                                type="button"
                                className="w-10 h-10 rounded-full border border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 flex items-center justify-center"
                              >
                                <Mic size={18} />
                              </button>
                            </div>
                            <button
                              disabled={loading}
                              className="w-12 h-12 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 flex items-center justify-center transition-colors hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50"
                            >
                              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <ArrowRight size={22} />}
                            </button>
                          </div>
                        </form>

                        <div className="mt-5 flex gap-2.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                          {t.suggestedTopics.filter((topic: any) => !topic.utility).slice(0, 4).map((topic: any) => (
                            <button
                              key={topic.text}
                              onClick={() => setPrompt(topic.query || '')}
                              className="shrink-0 px-4 py-2 rounded-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 text-sm text-stone-700 dark:text-stone-200 font-semibold"
                            >
                              {topic.text}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="hidden md:block">
                      <p className="text-stone-500 dark:text-stone-400 text-lg mb-12 max-w-md mx-auto leading-relaxed">
                        {t.heroDescription}
                      </p>

                      <form onSubmit={handleFormSubmit} className="relative max-w-xl mx-auto group mb-12">
                        <input 
                          type="text" 
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          placeholder={t.heroInputPlaceholder}
                          className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl py-6 pl-8 pr-20 shadow-xl shadow-stone-100 dark:shadow-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 dark:text-stone-100 placeholder:text-stone-300 dark:placeholder:text-stone-600"
                        />
                        <button 
                          disabled={loading}
                          className="absolute right-3 top-3 bottom-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 rounded-2xl flex items-center justify-center hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-50"
                        >
                          {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="hidden md:block w-full max-w-4xl mx-auto overflow-hidden">
                <p className="text-sm font-serif italic text-stone-400 dark:text-stone-500 mb-8 text-center">{t.popularTopics}</p>
                <div className="flex w-full max-w-full gap-4 overflow-x-auto overscroll-x-contain pb-2 px-1 snap-x snap-mandatory">
                  {t.suggestedTopics.filter((topic: any) => !topic.utility).map((topic: any) => (
                    <button 
                      key={topic.text}
                      onClick={() => {
                        if (topic.utility) {
                          setActiveUtility(topic.utility as any);
                        } else {
                          setPrompt(topic.query || '');
                        }
                      }}
                      className="group min-w-[240px] sm:min-w-[300px] p-5 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-3xl hover:border-emerald-500/30 dark:hover:border-emerald-400/30 hover:shadow-xl hover:shadow-emerald-500/5 transition-all text-left flex items-center gap-4 snap-start"
                    >
                      <div className="w-12 h-12 shrink-0 bg-stone-50 dark:bg-stone-800 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-sm">
                        {topic.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-stone-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-1">
                          {topic.text}
                        </h4>
                        <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">
                          {topic.description}
                        </p>
                      </div>
                      <ArrowRight size={16} className="text-stone-300 dark:text-stone-600 group-hover:text-emerald-500 transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          /* Chat History Section */
          <div className="space-y-12 pb-12">
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.type !== 'user' && (
                  <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Bot className="text-emerald-600 dark:text-emerald-400 w-6 h-6" />
                  </div>
                )}
                
                <div className={`max-w-[85%] ${message.type === 'user' ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 p-4 rounded-2xl rounded-tr-none shadow-lg' : 'w-full'}`}>
                  {message.type === 'user' && <p className="text-sm leading-relaxed">{message.content}</p>}
                  
                  {message.type === 'ai' && message.plan && (
                    <div className="space-y-4">
                      <TravelPlanDisplay 
                        plan={message.plan} 
                        onLocationClick={handleLocationClick}
                        onSuggestionClick={handleSuggestionClick}
                        t={t}
                      />
                      <div className="flex justify-end">
                        <button 
                          onClick={() => {
                            // Find the last user message to get the prompt
                            const userMessages = messages.filter(m => m.type === 'user');
                            if (userMessages.length > 0) {
                              regeneratePlan(userMessages[userMessages.length - 1].content || '');
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-100 dark:border-stone-800"
                        >
                          <History size={14} />
                          <span>{t.regenerate}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {message.type === 'loading' && (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                            <Loader2 className="animate-spin text-emerald-600 dark:text-emerald-400 w-6 h-6" />
                          </div>
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-stone-900 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="font-bold text-stone-900 dark:text-white text-sm">{aiProcessingLabel}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex gap-1">
                              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1 h-1 rounded-full bg-emerald-500" />
                              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1 h-1 rounded-full bg-emerald-500" />
                              <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1 h-1 rounded-full bg-emerald-500" />
                            </div>
                            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{aiOptimizingLabel}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {processingSteps.map((step, i) => (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.35 }}
                            className="flex items-center gap-2 px-3 py-2 bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-100 dark:border-stone-800"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-medium text-stone-500 dark:text-stone-400">{step}</span>
                          </motion.div>
                        ))}
                      </div>
                      
                      {message.streamingText && (
                        <div className="bg-stone-50 dark:bg-stone-900/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] uppercase tracking-widest text-stone-400 font-bold">{t.loadingRawData}</p>
                            <div className="flex gap-1">
                              <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping" />
                              <div className="w-1 h-1 rounded-full bg-emerald-500" />
                            </div>
                          </div>
                          <div className="max-h-24 overflow-y-auto font-mono text-[9px] text-stone-500 dark:text-stone-600 break-all opacity-40">
                            {message.streamingText}
                          </div>
                        </div>
                      )}

                      <button 
                        onClick={() => {
                          setLoading(false);
                          setMessages(prev => prev.filter(m => m.id !== message.id));
                        }}
                        className="text-[10px] font-bold text-stone-400 hover:text-red-500 transition-colors uppercase tracking-widest text-center"
                      >
                        {t.cancelRequest}
                      </button>
                    </div>
                  )}

                  {message.type === 'error' && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-sm flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p>{message.content}</p>
                    </div>
                  )}
                </div>

                {message.type === 'user' && (
                  <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
                    <User className="text-stone-600 w-6 h-6" />
                  </div>
                )}
              </motion.div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Quick Tools - Always visible at bottom */}
      <div className={`fixed bottom-3 sm:bottom-8 left-0 right-0 z-40 pointer-events-none ${messages.length === 0 && !activeUtility ? 'hidden md:block' : ''}`}>
        <div className="max-w-4xl mx-auto px-3 pointer-events-auto overflow-hidden">
          <div className="flex w-full max-w-full gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-1 pr-1">
          {t.suggestedTopics.filter((topic: any) => topic.utility).map((topic: any) => (
            <button
              key={topic.utility}
              onClick={() => setActiveUtility(topic.utility as any)}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all border backdrop-blur-md shadow-lg ${
                activeUtility === topic.utility
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white/90 dark:bg-stone-900/90 text-stone-700 dark:text-stone-200 border-stone-200 dark:border-stone-800 hover:border-emerald-500/50'
              }`}
            >
              <span>{topic.icon}</span>
              <span className="hidden sm:inline">{topic.text}</span>
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Sticky Input Field */}
      {messages.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-stone-900/80 backdrop-blur-md border-t border-stone-100 dark:border-stone-800 p-4 z-40">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleFormSubmit} className="relative">
              <input 
                type="text" 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.askMorePlaceholder}
                className="w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl py-4 pl-6 pr-16 shadow-lg shadow-stone-100 dark:shadow-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-stone-800 dark:text-stone-100 placeholder:text-stone-300 dark:placeholder:text-stone-600"
              />
              <button 
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 rounded-xl flex items-center justify-center hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send size={20} />}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Location Detail Modal */}
      <AnimatePresence>
        {selectedLocation && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLocation(null)}
              className="absolute inset-0 bg-stone-900/40 dark:bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white dark:bg-stone-900 rounded-[32px] w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col border border-stone-100 dark:border-stone-800"
            >
              <div className="p-8 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
                    <Info className="text-emerald-600 dark:text-emerald-400 w-5 h-5" />
                  </div>
                  <h4 className="text-2xl font-serif dark:text-white">{selectedLocation}</h4>
                </div>
                <button 
                  onClick={() => setSelectedLocation(null)}
                  className="w-10 h-10 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 flex items-center justify-center transition-colors dark:text-stone-400"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1">
                {loadingInfo ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="animate-spin text-emerald-600 dark:text-emerald-400 w-8 h-8" />
                    <p className="text-stone-400 dark:text-stone-500 font-serif italic">{t.findingInfo}</p>
                  </div>
                ) : (
                  <div className="prose prose-stone dark:prose-invert max-w-none">
                    <ReactMarkdown
                      components={{
                        a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                      }}
                    >
                      {locationInfo?.text || ''}
                    </ReactMarkdown>
                    
                    {locationInfo?.grounding && Array.isArray(locationInfo.grounding) && locationInfo.grounding.length > 0 && (
                      <div className="mt-8 pt-8 border-t border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-4 font-bold">{t.reliableSources}</p>
                        <div className="flex flex-wrap gap-3">
                          {locationInfo.grounding.map((chunk: any, i: number) => (
                            chunk.web && (
                              <a 
                                key={i} 
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs bg-stone-50 dark:bg-stone-800 px-4 py-2 rounded-xl border border-stone-100 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-2 dark:text-stone-300"
                              >
                                <span>{chunk.web.title || t.seeMore}</span>
                                <ArrowRight size={12} />
                              </a>
                            )
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUpgradeModal && (
          <UpgradeModal onClose={() => setShowUpgradeModal(false)} language={language} />
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-stone-50 dark:bg-stone-900 border-t border-stone-100 dark:border-stone-800 py-20 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
          <div id="footer-about" className="col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-sky-100 to-lime-100 dark:from-stone-800 dark:to-stone-700 rounded-lg border border-emerald-100 dark:border-stone-700 p-1">
                <OlachillLogo className="w-full h-full" />
              </div>
              <span className="font-serif italic text-2xl tracking-tight dark:text-white">{t.appName}</span>
            </div>
            <p className="text-stone-400 dark:text-stone-500 text-sm max-w-xs leading-relaxed">
              {t.footerDescription}
            </p>
            <a 
              href="https://olachill.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-block mt-4 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              Visit olachill.com
            </a>
          </div>
          <div id="footer-product">
            <h5 className="font-medium mb-6 dark:text-white">{t.product}</h5>
            <ul className="space-y-4 text-sm text-stone-400 dark:text-stone-500">
              <li><a href="#" className="hover:text-stone-900 dark:hover:text-white">{t.features}</a></li>
              <li>
                <button onClick={() => setShowUpgradeModal(true)} className="hover:text-stone-900 dark:hover:text-white">
                  {t.pricing}
                </button>
              </li>
              <li><a href="#" className="hover:text-stone-900 dark:hover:text-white">{t.downloadApp}</a></li>
            </ul>
          </div>
          <div id="footer-support">
            <h5 className="font-medium mb-6 dark:text-white">{t.support}</h5>
            <ul className="space-y-4 text-sm text-stone-400 dark:text-stone-500">
              <li><a href="#" className="hover:text-stone-900 dark:hover:text-white">{t.helpCenter}</a></li>
              <li><a href="#" className="hover:text-stone-900 dark:hover:text-white">{t.contact}</a></li>
              <li><a href="#" className="hover:text-stone-900 dark:hover:text-white">{t.terms}</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-stone-200 dark:border-stone-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-stone-400 dark:text-stone-500">© 2026 {t.appName}. {t.allRightsReserved}</p>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('language');
      if (saved === 'en' || saved === 'ja' || saved === 'vi') return saved as Language;
    }
    return 'vi';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  return (
    <ErrorBoundary language={language}>
      <AppContent language={language} setLanguage={setLanguage} />
    </ErrorBoundary>
  );
}
