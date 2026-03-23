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
  Mic,
  Copy,
  ChevronDown,
  Settings,
  FileText,
  LogIn,
  LogOut,
  CircleDollarSign,
  Languages,
  Thermometer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { generateTravelPlan, getPlaceInfo, TravelPlan } from './services/travelService';
import { searchTransitLocal, TransitMode, TransitLanguage } from './services/transitService';
import { auth, loginWithGoogle, consumeRedirectLoginResult, logout, db } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

// Remove Google Maps imports
// import { APIProvider } from '@vis.gl/react-google-maps';
// import { NearbySearch } from './components/NearbySearch';

// const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
// const hasValidKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

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
  language: Language,
  mode: TransitMode
) => {
  const hasJapaneseInput = /[\u3040-\u30ff\u3400-\u9fff]/.test(`${from}${to}`);
  const transitLanguage: TransitLanguage =
    language === 'ja' || hasJapaneseInput
      ? 'ja'
      : (language as TransitLanguage);
  return searchTransitLocal(from, to, time, mode, transitLanguage);
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
  ...Object.values(JAPAN_STATIONS_BY_CITY).flat(),
  '東京', '新宿', '渋谷', '上野', '品川', '池袋', '秋葉原', '浅草',
  '大阪', '難波', '梅田', '京都', '名古屋', '横浜', '博多', '福岡',
  '札幌', '広島', '奈良', '神戸', '鎌倉', '河口湖'
]));

const TrainSearch = ({
  onClose,
  language,
  initialMode = 'train',
  fullLayout = false
}: {
  onClose: () => void,
  language: Language,
  initialMode?: TransitMode,
  fullLayout?: boolean
}) => {
  const t = translations[language];
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const mode: TransitMode = 'train';
  const [showResults, setShowResults] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState<string[]>([]);
  const [toSuggestions, setToSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (initialMode !== 'train') {
      setShowResults(false);
      setResults([]);
    }
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

  const formatDateForJorudan = (rawDate: string) => {
    const [yyyy, mm, dd] = rawDate.split('-');
    if (!yyyy || !mm || !dd) return rawDate;
    return `${dd}/${mm}/${yyyy}`;
  };

  const hasJapaneseInput = /[\u3040-\u30ff\u3400-\u9fff]/.test(`${from}${to}`);
  const jorudanLocale = hasJapaneseInput ? 'ja' : language === 'ja' ? 'ja' : language === 'en' ? 'en' : 'vi';
  const jorudanUrl =
    `https://world.jorudan.co.jp/mln/${jorudanLocale}/?p=0&xpd=1` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&date=${encodeURIComponent(formatDateForJorudan(date))}` +
    `&time=${encodeURIComponent(time)}` +
    `&ft=0&ic=0&us=0&up=0&ut=0&nzm=0&sub_lang=nosub` +
    `&estf=${encodeURIComponent(from)}` +
    `&estt=${encodeURIComponent(to)}`;

  const openJorudan = () => {
    if (!from || !to) return;
    window.open(jorudanUrl, '_blank', 'noopener,noreferrer');
  };

  const openJorudanLabel =
    language === 'vi'
      ? 'Mở Jorudan chính thức'
      : language === 'ja'
        ? 'Jorudan公式で確認'
        : 'Open Official Jorudan';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl w-full ${
        fullLayout
          ? 'max-w-none max-h-none overflow-visible'
          : 'max-w-2xl max-h-[88vh] sm:max-h-[80vh] overflow-y-auto'
      }`}
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <span className="text-lg">🚄</span>
          </div>
          <div>
            <h3 className="text-xl font-serif dark:text-white">{t.trainSearchTitle}</h3>
            <p className="text-[10px] text-stone-400 uppercase tracking-widest font-bold">{t.trainSearchSubtitle}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors">
          <X size={20} className="text-stone-400" />
        </button>
      </div>

      {!showResults ? (
        <form onSubmit={handleSearch} className="space-y-6">
          <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <span>🚄</span>
            <span className="text-xs font-bold">{t.trainSearchTitle}</span>
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
          <button
            type="button"
            onClick={openJorudan}
            disabled={!from || !to}
            className="w-full border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 py-3 rounded-2xl text-sm font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
          >
            {openJorudanLabel}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 px-2 gap-2">
            <p className="text-sm font-medium text-stone-500">{t.resultsFor}: <span className="text-stone-900 dark:text-white font-bold">{from} → {to}</span></p>
            <div className="flex items-center gap-2">
              <button onClick={openJorudan} className="text-xs text-blue-600 font-bold hover:underline whitespace-nowrap">{openJorudanLabel}</button>
              <button onClick={() => setShowResults(false)} className="text-xs text-blue-600 font-bold hover:underline whitespace-nowrap">{t.changeSearch}</button>
            </div>
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

  const localCafeData = {
    vi: [
      { name: 'Koffee Mameya Kakeru', type: 'Specialty Cafe', priceRange: '$$$', description: 'Quầy bar cà phê nổi tiếng tại Tokyo, phù hợp trải nghiệm pour-over.', location: 'Omotesando, Tokyo', tags: ['coffee', 'cafe', 'tokyo', 'specialty'] },
      { name: 'Fuglen Asakusa', type: 'Cafe & Retro', priceRange: '$$', description: 'Không gian kiểu Bắc Âu, đẹp để chụp ảnh, gần Senso-ji.', location: 'Asakusa, Tokyo', tags: ['cafe', 'asakusa', 'tokyo', 'photo'] },
      { name: 'Menya Inoichi', type: 'Ramen', priceRange: '$$', description: 'Ramen thanh vị nổi tiếng ở Kyoto, thường hết sớm.', location: 'Shimogyo, Kyoto', tags: ['ramen', 'kyoto', 'food'] },
      { name: 'Gyukatsu Motomura', type: 'Wagyu', priceRange: '$$$', description: 'Set gyukatsu bò Nhật, hợp bữa trưa nhanh ở khu trung tâm.', location: 'Namba, Osaka', tags: ['wagyu', 'osaka', 'beef'] },
      { name: 'Saryo Tsujiri', type: 'Matcha Dessert', priceRange: '$$', description: 'Tráng miệng matcha truyền thống, vị đậm, nhiều chi nhánh.', location: 'Gion, Kyoto', tags: ['matcha', 'dessert', 'kyoto'] },
      { name: 'Uoriki Kaisen Sushi', type: 'Sushi', priceRange: '$$$', description: 'Sushi tươi theo mùa, phù hợp cho bữa tối.', location: 'Tokyo Station', tags: ['sushi', 'tokyo', 'seafood'] }
    ],
    en: [
      { name: 'Koffee Mameya Kakeru', type: 'Specialty Cafe', priceRange: '$$$', description: 'Top coffee counter in Tokyo, great for guided pour-over tasting.', location: 'Omotesando, Tokyo', tags: ['coffee', 'cafe', 'tokyo', 'specialty'] },
      { name: 'Fuglen Asakusa', type: 'Cafe & Retro', priceRange: '$$', description: 'Scandinavian-style cafe near Senso-ji, strong photo spot.', location: 'Asakusa, Tokyo', tags: ['cafe', 'asakusa', 'tokyo', 'photo'] },
      { name: 'Menya Inoichi', type: 'Ramen', priceRange: '$$', description: 'Popular light ramen in Kyoto, often sold out early.', location: 'Shimogyo, Kyoto', tags: ['ramen', 'kyoto', 'food'] },
      { name: 'Gyukatsu Motomura', type: 'Wagyu', priceRange: '$$$', description: 'Famous gyukatsu set, convenient for central Osaka lunches.', location: 'Namba, Osaka', tags: ['wagyu', 'osaka', 'beef'] },
      { name: 'Saryo Tsujiri', type: 'Matcha Dessert', priceRange: '$$', description: 'Classic matcha dessert brand with rich tea flavor.', location: 'Gion, Kyoto', tags: ['matcha', 'dessert', 'kyoto'] },
      { name: 'Uoriki Kaisen Sushi', type: 'Sushi', priceRange: '$$$', description: 'Seasonal sushi selection, great for dinner.', location: 'Tokyo Station', tags: ['sushi', 'tokyo', 'seafood'] }
    ],
    ja: [
      { name: 'Koffee Mameya Kakeru', type: 'スペシャルティカフェ', priceRange: '$$$', description: '東京の人気コーヒーカウンター。ハンドドリップ体験向け。', location: '東京・表参道', tags: ['coffee', 'cafe', 'tokyo', 'specialty'] },
      { name: 'Fuglen Asakusa', type: 'カフェ', priceRange: '$$', description: '浅草寺近くの北欧スタイル。写真映えしやすい店舗。', location: '東京・浅草', tags: ['cafe', 'asakusa', 'tokyo', 'photo'] },
      { name: '麺屋 猪一', type: 'ラーメン', priceRange: '$$', description: '京都で人気のあっさり系ラーメン。早めの来店がおすすめ。', location: '京都・下京区', tags: ['ramen', 'kyoto', 'food'] },
      { name: '牛かつもと村', type: '和牛', priceRange: '$$$', description: '和牛カツ定食が人気。大阪中心地で使いやすい。', location: '大阪・難波', tags: ['wagyu', 'osaka', 'beef'] },
      { name: '茶寮都路里', type: '抹茶スイーツ', priceRange: '$$', description: '定番の抹茶デザート。濃い味の抹茶が魅力。', location: '京都・祇園', tags: ['matcha', 'dessert', 'kyoto'] },
      { name: '魚力海鮮寿司', type: '寿司', priceRange: '$$$', description: '季節のネタが楽しめる寿司。夜ごはんにおすすめ。', location: '東京駅', tags: ['sushi', 'tokyo', 'seafood'] }
    ]
  } as const;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const keyword = query.trim().toLowerCase();
      const source = localCafeData[language];
      const matched = source.filter((item) => {
        const haystack = `${item.name} ${item.type} ${item.description} ${item.location} ${item.tags.join(' ')}`.toLowerCase();
        return haystack.includes(keyword);
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
      setResults((matched.length > 0 ? matched : source).slice(0, 5));
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

  const localSecondHandData = {
    vi: [
      { name: 'Hard Off Akihabara', type: 'Electronics', description: 'Nhiều máy ảnh, lens và đồ điện tử đã qua sử dụng.', location: 'Akihabara, Tokyo', tags: ['camera', 'electronics', 'tokyo'] },
      { name: 'Book Off Super Bazaar', type: 'Fashion & Books', description: 'Đa dạng quần áo, sách, đĩa và phụ kiện giá mềm.', location: 'Ikebukuro, Tokyo', tags: ['fashion', 'book', 'tokyo'] },
      { name: '2nd Street Shinsaibashi', type: 'Streetwear', description: 'Đồ thời trang local/JDM và sneaker cũ chất lượng.', location: 'Shinsaibashi, Osaka', tags: ['fashion', 'sneaker', 'osaka'] },
      { name: 'Mandarake Complex', type: 'Anime Figure', description: 'Điểm săn figure, manga, goods anime nổi tiếng.', location: 'Akihabara, Tokyo', tags: ['anime', 'figure', 'tokyo'] },
      { name: 'Daikokuya Shinjuku', type: 'Luxury Bag', description: 'Túi/đồng hồ hàng hiệu đã qua sử dụng, có bảo hành cửa hàng.', location: 'Shinjuku, Tokyo', tags: ['luxury', 'bag', 'watch'] },
      { name: 'Ishibashi Music Umeda', type: 'Instrument', description: 'Nhiều guitar và nhạc cụ cũ, phù hợp test tại chỗ.', location: 'Umeda, Osaka', tags: ['instrument', 'guitar', 'osaka'] }
    ],
    en: [
      { name: 'Hard Off Akihabara', type: 'Electronics', description: 'Strong selection of used cameras, lenses, and gadgets.', location: 'Akihabara, Tokyo', tags: ['camera', 'electronics', 'tokyo'] },
      { name: 'Book Off Super Bazaar', type: 'Fashion & Books', description: 'Large inventory of used clothes, books, and media.', location: 'Ikebukuro, Tokyo', tags: ['fashion', 'book', 'tokyo'] },
      { name: '2nd Street Shinsaibashi', type: 'Streetwear', description: 'Good spot for local fashion and second-hand sneakers.', location: 'Shinsaibashi, Osaka', tags: ['fashion', 'sneaker', 'osaka'] },
      { name: 'Mandarake Complex', type: 'Anime Figure', description: 'Iconic destination for figures, manga, and anime goods.', location: 'Akihabara, Tokyo', tags: ['anime', 'figure', 'tokyo'] },
      { name: 'Daikokuya Shinjuku', type: 'Luxury Bag', description: 'Trusted chain for pre-owned luxury bags and watches.', location: 'Shinjuku, Tokyo', tags: ['luxury', 'bag', 'watch'] },
      { name: 'Ishibashi Music Umeda', type: 'Instrument', description: 'Used guitars and instruments with in-store testing.', location: 'Umeda, Osaka', tags: ['instrument', 'guitar', 'osaka'] }
    ],
    ja: [
      { name: 'ハードオフ秋葉原', type: '家電', description: '中古カメラ・レンズ・電子機器が豊富。', location: '東京・秋葉原', tags: ['camera', 'electronics', 'tokyo'] },
      { name: 'ブックオフ スーパーバザー', type: '古着・書籍', description: '古着、書籍、メディアをまとめて探せます。', location: '東京・池袋', tags: ['fashion', 'book', 'tokyo'] },
      { name: '2nd STREET 心斎橋', type: 'ストリート系', description: '古着とスニーカーの在庫が安定している店舗。', location: '大阪・心斎橋', tags: ['fashion', 'sneaker', 'osaka'] },
      { name: 'まんだらけコンプレックス', type: 'アニメフィギュア', description: 'フィギュア・漫画・グッズの定番スポット。', location: '東京・秋葉原', tags: ['anime', 'figure', 'tokyo'] },
      { name: '大黒屋 新宿', type: 'ブランド品', description: '中古ブランドバッグ・時計の取り扱いが多い。', location: '東京・新宿', tags: ['luxury', 'bag', 'watch'] },
      { name: 'イシバシ楽器 梅田', type: '楽器', description: '中古ギターや楽器を試奏しながら選べます。', location: '大阪・梅田', tags: ['instrument', 'guitar', 'osaka'] }
    ]
  } as const;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const keyword = query.trim().toLowerCase();
      const source = localSecondHandData[language];
      const matched = source.filter((item) => {
        const haystack = `${item.name} ${item.type} ${item.description} ${item.location} ${item.tags.join(' ')}`.toLowerCase();
        return haystack.includes(keyword);
      });
      await new Promise((resolve) => setTimeout(resolve, 220));
      setResults((matched.length > 0 ? matched : source).slice(0, 5));
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

const TicketSearch = ({
  onClose,
  language,
  fullLayout = false
}: {
  onClose: () => void,
  language: Language,
  fullLayout?: boolean
}) => {
  const t = translations[language];
  const copyByLang = {
    vi: {
      panelTickets: 'Vé tham quan',
      panelParks: 'Vé công viên',
      panelCheapBus: 'Xe khách siêu rẻ',
      panelTransfer: 'Dịch vụ đưa đón',
      panelPrivateCar: 'Thuê xe riêng',
      panelFood: 'Ẩm thực',
      sortLabel: 'Sắp xếp',
      sortPopular: 'Nổi tiếng',
      sortPriceAsc: 'Giá thấp -> cao',
      sortPriceDesc: 'Giá cao -> thấp',
      priceFilterLabel: 'Lọc giá',
      priceAll: 'Tất cả',
      priceBudget: '<= 3,000 JPY',
      priceMid: '3,001 - 6,000 JPY',
      priceHigh: '> 6,000 JPY',
      openKkdayTickets: 'Mở vé KKday Nhật Bản',
      openKkdayParks: 'Mở vé công viên KKday',
      openKkdayBus: 'Mở xe khách KKday',
      openKkdayTransfer: 'Mở dịch vụ đưa đón KKday',
      openKkdayPrivateCar: 'Mở thuê xe riêng KKday',
      openKkdayFood: 'Mở ẩm thực KKday',
      ticketSourceNote: 'Nguồn vé: KKday Japan Attraction Tickets (affiliate)',
      parksSourceNote: 'Nguồn vé công viên: KKday Japan Amusement Parks (affiliate)',
      busSourceNote: 'Nguồn xe khách: KKday Transportation Japan (affiliate)',
      transferSourceNote: 'Nguồn dịch vụ đưa đón: KKday Transport & Car (affiliate)',
      privateCarSourceNote: 'Nguồn thuê xe riêng: KKday Private Car Charter (affiliate)',
      foodSourceNote: 'Nguồn ẩm thực: KKday Restaurants (affiliate)',
      transferCategories: {
        all: 'Tất cả',
        rental: 'Xe thuê',
        airport: 'Đưa đón tại sân bay',
        card: 'Thẻ',
        bus: 'Xe buýt',
        train: 'Tàu hỏa',
        ferry: 'Phà',
        bike: 'Thuê xe đạp',
        car: 'Thuê xe ô tô',
        flight: 'Chuyến bay'
      },
      privateCarCategories: {
        all: 'Tất cả',
        charter: 'Xe charter',
        airport: 'Đón tiễn sân bay',
        city: 'Đi trong thành phố',
        intercity: 'Liên tỉnh',
        family: 'Gia đình/Nhóm'
      },
      busCategories: {
        all: 'Tất cả',
        airport: 'Bus sân bay',
        highway: 'Bus liên tỉnh',
        city: 'Bus nội đô',
        night: 'Bus đêm',
        pass: 'Vé/PASS'
      },
      foodCategories: {
        all: 'Tất cả',
        sushi: 'Sushi',
        ramen: 'Ramen',
        wagyu: 'Wagyu',
        buffet: 'Buffet',
        teaDessert: 'Trà & tráng miệng'
      }
    },
    en: {
      panelTickets: 'Attraction Tickets',
      panelParks: 'Amusement Parks',
      panelCheapBus: 'Cheap Bus',
      panelTransfer: 'Transport Services',
      panelPrivateCar: 'Private Car',
      panelFood: 'Food & Dining',
      sortLabel: 'Sort',
      sortPopular: 'Popular',
      sortPriceAsc: 'Price Low -> High',
      sortPriceDesc: 'Price High -> Low',
      priceFilterLabel: 'Price Filter',
      priceAll: 'All',
      priceBudget: '<= 3,000 JPY',
      priceMid: '3,001 - 6,000 JPY',
      priceHigh: '> 6,000 JPY',
      openKkdayTickets: 'Open KKday Japan Tickets',
      openKkdayParks: 'Open KKday Amusement Parks',
      openKkdayBus: 'Open KKday Bus Deals',
      openKkdayTransfer: 'Open KKday Transport Services',
      openKkdayPrivateCar: 'Open KKday Private Car',
      openKkdayFood: 'Open KKday Restaurants',
      ticketSourceNote: 'Ticket source: KKday Japan Attraction Tickets (affiliate)',
      parksSourceNote: 'Parks source: KKday Japan Amusement Parks (affiliate)',
      busSourceNote: 'Bus source: KKday Transportation Japan (affiliate)',
      transferSourceNote: 'Transport source: KKday Transport & Car (affiliate)',
      privateCarSourceNote: 'Private car source: KKday Private Car Charter (affiliate)',
      foodSourceNote: 'Dining source: KKday Restaurants (affiliate)',
      transferCategories: {
        all: 'All',
        rental: 'Rental',
        airport: 'Airport Transfer',
        card: 'Cards',
        bus: 'Bus',
        train: 'Train',
        ferry: 'Ferry',
        bike: 'Bike Rental',
        car: 'Car Rental',
        flight: 'Flight'
      },
      privateCarCategories: {
        all: 'All',
        charter: 'Charter',
        airport: 'Airport Pickup',
        city: 'City Ride',
        intercity: 'Intercity',
        family: 'Family/Group'
      },
      busCategories: {
        all: 'All',
        airport: 'Airport Bus',
        highway: 'Highway Bus',
        city: 'City Bus',
        night: 'Night Bus',
        pass: 'Pass/Ticket'
      },
      foodCategories: {
        all: 'All',
        sushi: 'Sushi',
        ramen: 'Ramen',
        wagyu: 'Wagyu',
        buffet: 'Buffet',
        teaDessert: 'Tea & Dessert'
      }
    },
    ja: {
      panelTickets: '観光チケット',
      panelParks: '遊園地チケット',
      panelCheapBus: '格安バス',
      panelTransfer: '送迎サービス',
      panelPrivateCar: '貸切チャーター',
      panelFood: 'グルメ',
      sortLabel: '並び替え',
      sortPopular: '人気順',
      sortPriceAsc: '価格が安い順',
      sortPriceDesc: '価格が高い順',
      priceFilterLabel: '価格フィルター',
      priceAll: 'すべて',
      priceBudget: '3,000 JPY 以下',
      priceMid: '3,001 - 6,000 JPY',
      priceHigh: '6,000 JPY 超',
      openKkdayTickets: 'KKday 日本チケットを開く',
      openKkdayParks: 'KKday 遊園地チケットを開く',
      openKkdayBus: 'KKday 格安バスを開く',
      openKkdayTransfer: 'KKday 送迎サービスを開く',
      openKkdayPrivateCar: 'KKday 貸切チャーターを開く',
      openKkdayFood: 'KKday グルメを開く',
      ticketSourceNote: 'チケット提供元: KKday Japan Attraction Tickets (affiliate)',
      parksSourceNote: '遊園地チケット提供元: KKday Japan Amusement Parks (affiliate)',
      busSourceNote: 'バス提供元: KKday Transportation Japan (affiliate)',
      transferSourceNote: '送迎提供元: KKday Transport & Car (affiliate)',
      privateCarSourceNote: '貸切車両提供元: KKday Private Car Charter (affiliate)',
      foodSourceNote: 'グルメ提供元: KKday Restaurants (affiliate)',
      transferCategories: {
        all: 'すべて',
        rental: 'レンタル',
        airport: '空港送迎',
        card: 'カード',
        bus: 'バス',
        train: '電車',
        ferry: 'フェリー',
        bike: '自転車レンタル',
        car: 'レンタカー',
        flight: 'フライト'
      },
      privateCarCategories: {
        all: 'すべて',
        charter: 'チャーター',
        airport: '空港送迎',
        city: '市内移動',
        intercity: '都市間',
        family: '家族・グループ'
      },
      busCategories: {
        all: 'すべて',
        airport: '空港バス',
        highway: '高速バス',
        city: '市内バス',
        night: '夜行バス',
        pass: 'パス・チケット'
      },
      foodCategories: {
        all: 'すべて',
        sushi: '寿司',
        ramen: 'ラーメン',
        wagyu: '和牛',
        buffet: 'ビュッフェ',
        teaDessert: 'お茶・デザート'
      }
    }
  } as const;
  const cp = copyByLang[language];
  type TicketPanel = 'tickets' | 'parks' | 'bus' | 'transfer' | 'privatecar' | 'food';
  type TicketItem = {
    name: string;
    priceJpy: number;
    icon: string;
    cat: string;
    rating: number;
    image: string;
    slug: string;
  };

  const ticketCategories = [t.categories.all, t.categories.themePark, t.categories.museum, t.categories.observatory, t.categories.experience];
  const transferCategories = [
    cp.transferCategories.all,
    cp.transferCategories.rental,
    cp.transferCategories.airport,
    cp.transferCategories.card,
    cp.transferCategories.bus,
    cp.transferCategories.train,
    cp.transferCategories.ferry,
    cp.transferCategories.bike,
    cp.transferCategories.car,
    cp.transferCategories.flight
  ];
  const privateCarCategories = [
    cp.privateCarCategories.all,
    cp.privateCarCategories.charter,
    cp.privateCarCategories.airport,
    cp.privateCarCategories.city,
    cp.privateCarCategories.intercity,
    cp.privateCarCategories.family
  ];
  const busCategories = [
    cp.busCategories.all,
    cp.busCategories.airport,
    cp.busCategories.highway,
    cp.busCategories.city,
    cp.busCategories.night,
    cp.busCategories.pass
  ];
  const foodCategories = [
    cp.foodCategories.all,
    cp.foodCategories.sushi,
    cp.foodCategories.ramen,
    cp.foodCategories.wagyu,
    cp.foodCategories.buffet,
    cp.foodCategories.teaDessert
  ];

  const [panelType, setPanelType] = useState<TicketPanel>('tickets');
  const [activeTicketCat, setActiveTicketCat] = useState<string>(ticketCategories[0]);
  const [activeParkCat, setActiveParkCat] = useState<string>(ticketCategories[0]);
  const [activeBusCat, setActiveBusCat] = useState<string>(busCategories[0]);
  const [activeTransferCat, setActiveTransferCat] = useState<string>(transferCategories[0]);
  const [activePrivateCarCat, setActivePrivateCarCat] = useState<string>(privateCarCategories[0]);
  const [activeFoodCat, setActiveFoodCat] = useState<string>(foodCategories[0]);
  const [sortBy, setSortBy] = useState<'popular' | 'price-asc' | 'price-desc'>('popular');
  const [priceBand, setPriceBand] = useState<'all' | 'budget' | 'mid' | 'premium'>('all');
  const [qrTicket, setQrTicket] = useState<{ name: string; slug: string } | null>(null);
  const ticketAffiliateSlug = 'kkday-jp-attraction-tickets';
  const parkAffiliateSlug = 'kkday-jp-amusement-parks';
  const busAffiliateSlug = 'kkday-jp-cheap-bus';
  const transferAffiliateSlug = 'kkday-jp-transfer-services';
  const privateCarAffiliateSlug = 'kkday-jp-private-car';
  const foodAffiliateSlug = 'kkday-global-restaurants';

  useEffect(() => {
    setActiveTicketCat(ticketCategories[0]);
    setActiveParkCat(ticketCategories[0]);
    setActiveBusCat(busCategories[0]);
    setActiveTransferCat(transferCategories[0]);
    setActivePrivateCarCat(privateCarCategories[0]);
    setActiveFoodCat(foodCategories[0]);
  }, [language]);

  const getBrandedLink = (slug: string) => {
    if (typeof window === 'undefined') return `/go/${slug}`;
    return `${window.location.origin}/go/${slug}`;
  };

  const openPartnerLink = (slug: string) => {
    window.open(`/go/${slug}`, '_blank', 'noopener,noreferrer');
  };

  const formatPriceJpy = (priceJpy: number) => {
    const locale = language === 'vi' ? 'vi-VN' : language === 'ja' ? 'ja-JP' : 'en-US';
    return `${new Intl.NumberFormat(locale).format(priceJpy)} JPY`;
  };

  const tickets: TicketItem[] = [
    { 
      name: 'Tokyo Disneyland', 
      priceJpy: 8400,
      icon: '🎡', 
      cat: t.categories.themePark, 
      rating: 4.9,
      image: 'https://picsum.photos/seed/disney/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Universal Studios Japan', 
      priceJpy: 8600,
      icon: '🎢', 
      cat: t.categories.themePark, 
      rating: 4.8,
      image: 'https://picsum.photos/seed/usj/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'TeamLab Borderless', 
      priceJpy: 3800,
      icon: '💡', 
      cat: t.categories.museum, 
      rating: 4.9,
      image: 'https://picsum.photos/seed/teamlab/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Shibuya Sky', 
      priceJpy: 2200,
      icon: '🏙️', 
      cat: t.categories.observatory, 
      rating: 4.7,
      image: 'https://picsum.photos/seed/shibuya/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Ghibli Museum', 
      priceJpy: 1000,
      icon: '🌳', 
      cat: t.categories.museum, 
      rating: 5.0,
      image: 'https://picsum.photos/seed/ghibli/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Tokyo Skytree', 
      priceJpy: 3100,
      icon: '🗼', 
      cat: t.categories.observatory, 
      rating: 4.6,
      image: 'https://picsum.photos/seed/skytree/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Kyoto Kimono Rental', 
      priceJpy: 3500,
      icon: '👘', 
      cat: t.categories.experience, 
      rating: 4.8,
      image: 'https://picsum.photos/seed/kimono/400/250',
      slug: ticketAffiliateSlug
    },
    { 
      name: 'Nara Deer Park Tour', 
      priceJpy: 5000,
      icon: '🦌', 
      cat: t.categories.experience, 
      rating: 4.7,
      image: 'https://picsum.photos/seed/nara/400/250',
      slug: ticketAffiliateSlug
    }
  ];

  const transferServices: TicketItem[] = [
    {
      name: 'Tokyo Airport Private Transfer',
      priceJpy: 7500,
      icon: '🚐',
      cat: cp.transferCategories.airport,
      rating: 4.8,
      image: 'https://picsum.photos/seed/transfer-airport-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Osaka Kansai Airport Pickup',
      priceJpy: 6900,
      icon: '🛬',
      cat: cp.transferCategories.airport,
      rating: 4.7,
      image: 'https://picsum.photos/seed/transfer-airport-2/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'JR Pass / Rail Pass Deals',
      priceJpy: 4800,
      icon: '🎫',
      cat: cp.transferCategories.card,
      rating: 4.9,
      image: 'https://picsum.photos/seed/transfer-card-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Tokyo Bus Pass & Route Cards',
      priceJpy: 2600,
      icon: '🚌',
      cat: cp.transferCategories.bus,
      rating: 4.6,
      image: 'https://picsum.photos/seed/transfer-bus-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Shinkansen + Reserved Seat Packages',
      priceJpy: 9800,
      icon: '🚄',
      cat: cp.transferCategories.train,
      rating: 4.9,
      image: 'https://picsum.photos/seed/transfer-train-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Japan Ferry Short Routes',
      priceJpy: 4200,
      icon: '⛴️',
      cat: cp.transferCategories.ferry,
      rating: 4.4,
      image: 'https://picsum.photos/seed/transfer-ferry-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Kyoto Bike Rental City Pass',
      priceJpy: 1800,
      icon: '🚲',
      cat: cp.transferCategories.bike,
      rating: 4.5,
      image: 'https://picsum.photos/seed/transfer-bike-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Hokkaido Car Rental Daily Deals',
      priceJpy: 8200,
      icon: '🚗',
      cat: cp.transferCategories.car,
      rating: 4.7,
      image: 'https://picsum.photos/seed/transfer-car-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Domestic Flight + Transit Bundle',
      priceJpy: 12800,
      icon: '✈️',
      cat: cp.transferCategories.flight,
      rating: 4.3,
      image: 'https://picsum.photos/seed/transfer-flight-1/400/250',
      slug: transferAffiliateSlug
    },
    {
      name: 'Regional Car/Van Charter',
      priceJpy: 11500,
      icon: '🚘',
      cat: cp.transferCategories.rental,
      rating: 4.6,
      image: 'https://picsum.photos/seed/transfer-rental-1/400/250',
      slug: transferAffiliateSlug
    }
  ];

  const parkTickets: TicketItem[] = [
    {
      name: 'Tokyo Disneyland 1-Day Pass',
      priceJpy: 8400,
      icon: '🏰',
      cat: t.categories.themePark,
      rating: 4.9,
      image: 'https://picsum.photos/seed/park-disney/400/250',
      slug: parkAffiliateSlug
    },
    {
      name: 'Universal Studios Japan Studio Pass',
      priceJpy: 8600,
      icon: '🎢',
      cat: t.categories.themePark,
      rating: 4.8,
      image: 'https://picsum.photos/seed/park-usj/400/250',
      slug: parkAffiliateSlug
    },
    {
      name: 'Fuji-Q Highland Free Pass',
      priceJpy: 6200,
      icon: '🎡',
      cat: t.categories.themePark,
      rating: 4.7,
      image: 'https://picsum.photos/seed/park-fujiq/400/250',
      slug: parkAffiliateSlug
    },
    {
      name: 'Nijigen no Mori Anime Park',
      priceJpy: 4300,
      icon: '🧩',
      cat: t.categories.experience,
      rating: 4.6,
      image: 'https://picsum.photos/seed/park-anime/400/250',
      slug: parkAffiliateSlug
    }
  ];

  const privateCarServices: TicketItem[] = [
    {
      name: 'Tokyo Private Car 8-Hour Charter',
      priceJpy: 14800,
      icon: '🚘',
      cat: cp.privateCarCategories.charter,
      rating: 4.8,
      image: 'https://picsum.photos/seed/private-car-1/400/250',
      slug: privateCarAffiliateSlug
    },
    {
      name: 'Narita/Haneda Airport Private Transfer',
      priceJpy: 7600,
      icon: '🛬',
      cat: cp.privateCarCategories.airport,
      rating: 4.7,
      image: 'https://picsum.photos/seed/private-airport-1/400/250',
      slug: privateCarAffiliateSlug
    },
    {
      name: 'Osaka/Kyoto City Private Ride',
      priceJpy: 9800,
      icon: '🚗',
      cat: cp.privateCarCategories.city,
      rating: 4.6,
      image: 'https://picsum.photos/seed/private-city-1/400/250',
      slug: privateCarAffiliateSlug
    },
    {
      name: 'Tokyo ⇄ Fuji Intercity Charter',
      priceJpy: 16800,
      icon: '🗻',
      cat: cp.privateCarCategories.intercity,
      rating: 4.9,
      image: 'https://picsum.photos/seed/private-intercity-1/400/250',
      slug: privateCarAffiliateSlug
    },
    {
      name: 'Family Van with Child Seat',
      priceJpy: 13200,
      icon: '👨‍👩‍👧‍👦',
      cat: cp.privateCarCategories.family,
      rating: 4.7,
      image: 'https://picsum.photos/seed/private-family-1/400/250',
      slug: privateCarAffiliateSlug
    }
  ];

  const cheapBusServices: TicketItem[] = [
    {
      name: 'Narita Limousine Bus Ticket',
      priceJpy: 3200,
      icon: '🚌',
      cat: cp.busCategories.airport,
      rating: 4.7,
      image: 'https://picsum.photos/seed/bus-airport-1/400/250',
      slug: busAffiliateSlug
    },
    {
      name: 'Osaka ⇄ Kyoto Highway Bus',
      priceJpy: 1800,
      icon: '🛣️',
      cat: cp.busCategories.highway,
      rating: 4.6,
      image: 'https://picsum.photos/seed/bus-highway-1/400/250',
      slug: busAffiliateSlug
    },
    {
      name: 'Tokyo City 24h Bus Pass',
      priceJpy: 900,
      icon: '🎫',
      cat: cp.busCategories.pass,
      rating: 4.5,
      image: 'https://picsum.photos/seed/bus-pass-1/400/250',
      slug: busAffiliateSlug
    },
    {
      name: 'Shinjuku Night Bus to Osaka',
      priceJpy: 4600,
      icon: '🌙',
      cat: cp.busCategories.night,
      rating: 4.8,
      image: 'https://picsum.photos/seed/bus-night-1/400/250',
      slug: busAffiliateSlug
    },
    {
      name: 'Sapporo City Loop Bus',
      priceJpy: 1300,
      icon: '🏙️',
      cat: cp.busCategories.city,
      rating: 4.4,
      image: 'https://picsum.photos/seed/bus-city-1/400/250',
      slug: busAffiliateSlug
    }
  ];

  const foodExperiences: TicketItem[] = [
    {
      name: 'Tokyo Omakase Sushi Experience',
      priceJpy: 9200,
      icon: '🍣',
      cat: cp.foodCategories.sushi,
      rating: 4.9,
      image: 'https://picsum.photos/seed/food-sushi-1/400/250',
      slug: foodAffiliateSlug
    },
    {
      name: 'Sapporo Miso Ramen Tour',
      priceJpy: 3400,
      icon: '🍜',
      cat: cp.foodCategories.ramen,
      rating: 4.7,
      image: 'https://picsum.photos/seed/food-ramen-1/400/250',
      slug: foodAffiliateSlug
    },
    {
      name: 'Kobe Wagyu Dinner Course',
      priceJpy: 14800,
      icon: '🥩',
      cat: cp.foodCategories.wagyu,
      rating: 4.9,
      image: 'https://picsum.photos/seed/food-wagyu-1/400/250',
      slug: foodAffiliateSlug
    },
    {
      name: 'Kyoto Kaiseki Seasonal Set',
      priceJpy: 11800,
      icon: '🍱',
      cat: cp.foodCategories.buffet,
      rating: 4.8,
      image: 'https://picsum.photos/seed/food-kaiseki-1/400/250',
      slug: foodAffiliateSlug
    },
    {
      name: 'Matcha & Dessert Cafe Pass',
      priceJpy: 2600,
      icon: '🍵',
      cat: cp.foodCategories.teaDessert,
      rating: 4.6,
      image: 'https://picsum.photos/seed/food-dessert-1/400/250',
      slug: foodAffiliateSlug
    },
    {
      name: 'Osaka Street Food Night',
      priceJpy: 4700,
      icon: '🍢',
      cat: cp.foodCategories.buffet,
      rating: 4.7,
      image: 'https://picsum.photos/seed/food-osaka-1/400/250',
      slug: foodAffiliateSlug
    }
  ];

  const panelConfig: Record<
    TicketPanel,
    {
      categories: string[];
      activeCat: string;
      items: TicketItem[];
      slug: string;
      sourceNote: string;
      sourceButtonLabel: string;
    }
  > = {
    tickets: {
      categories: ticketCategories,
      activeCat: activeTicketCat,
      items: tickets,
      slug: ticketAffiliateSlug,
      sourceNote: cp.ticketSourceNote,
      sourceButtonLabel: cp.openKkdayTickets
    },
    parks: {
      categories: ticketCategories,
      activeCat: activeParkCat,
      items: parkTickets,
      slug: parkAffiliateSlug,
      sourceNote: cp.parksSourceNote,
      sourceButtonLabel: cp.openKkdayParks
    },
    bus: {
      categories: busCategories,
      activeCat: activeBusCat,
      items: cheapBusServices,
      slug: busAffiliateSlug,
      sourceNote: cp.busSourceNote,
      sourceButtonLabel: cp.openKkdayBus
    },
    transfer: {
      categories: transferCategories,
      activeCat: activeTransferCat,
      items: transferServices,
      slug: transferAffiliateSlug,
      sourceNote: cp.transferSourceNote,
      sourceButtonLabel: cp.openKkdayTransfer
    },
    privatecar: {
      categories: privateCarCategories,
      activeCat: activePrivateCarCat,
      items: privateCarServices,
      slug: privateCarAffiliateSlug,
      sourceNote: cp.privateCarSourceNote,
      sourceButtonLabel: cp.openKkdayPrivateCar
    },
    food: {
      categories: foodCategories,
      activeCat: activeFoodCat,
      items: foodExperiences,
      slug: foodAffiliateSlug,
      sourceNote: cp.foodSourceNote,
      sourceButtonLabel: cp.openKkdayFood
    }
  };

  const currentPanel = panelConfig[panelType];
  const currentCategories = currentPanel.categories;
  const activeCat = currentPanel.activeCat;
  const currentItems = currentPanel.items;
  const currentAffiliateSlug = currentPanel.slug;
  const sourceNote = currentPanel.sourceNote;
  const sourceButtonLabel = currentPanel.sourceButtonLabel;

  const filteredByCategory = activeCat === currentCategories[0]
    ? currentItems
    : currentItems.filter((item) => item.cat === activeCat);

  const filteredByPrice = filteredByCategory.filter((item) => {
    if (priceBand === 'budget') return item.priceJpy <= 3000;
    if (priceBand === 'mid') return item.priceJpy > 3000 && item.priceJpy <= 6000;
    if (priceBand === 'premium') return item.priceJpy > 6000;
    return true;
  });

  const filtered = [...filteredByPrice].sort((a, b) => {
    if (sortBy === 'price-asc') return a.priceJpy - b.priceJpy;
    if (sortBy === 'price-desc') return b.priceJpy - a.priceJpy;
    return b.rating - a.rating || a.priceJpy - b.priceJpy;
  });

  return (
    <>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl w-full ${
          fullLayout
            ? 'max-w-none max-h-none overflow-visible'
            : 'max-w-3xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto'
        }`}
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

        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setPanelType('tickets')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'tickets'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelTickets}
          </button>
          <button
            onClick={() => setPanelType('parks')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'parks'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelParks}
          </button>
          <button
            onClick={() => setPanelType('bus')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'bus'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelCheapBus}
          </button>
          <button
            onClick={() => setPanelType('transfer')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'transfer'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelTransfer}
          </button>
          <button
            onClick={() => setPanelType('privatecar')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'privatecar'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelPrivateCar}
          </button>
          <button
            onClick={() => setPanelType('food')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              panelType === 'food'
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
            }`}
          >
            {cp.panelFood}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5 mb-6">
          <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-800/50 p-3 space-y-2">
            {currentCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  if (panelType === 'tickets') {
                    setActiveTicketCat(cat);
                  } else if (panelType === 'parks') {
                    setActiveParkCat(cat);
                  } else if (panelType === 'bus') {
                    setActiveBusCat(cat);
                  } else if (panelType === 'transfer') {
                    setActiveTransferCat(cat);
                  } else if (panelType === 'privatecar') {
                    setActivePrivateCarCat(cat);
                  } else {
                    setActiveFoodCat(cat);
                  }
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-colors ${
                  activeCat === cat
                    ? 'bg-cyan-500/20 text-cyan-900 dark:text-cyan-200'
                    : 'hover:bg-white dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center text-white ${activeCat === cat ? 'bg-cyan-500' : 'bg-cyan-400/80'}`}>
                    <CheckCircle2 size={12} />
                  </span>
                  <span className="text-sm font-semibold">{cat}</span>
                </span>
                <ChevronRight size={16} className="text-stone-400" />
              </button>
            ))}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-widest font-bold text-stone-400">{cp.sortLabel}</span>
              <button
                onClick={() => setSortBy('popular')}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                  sortBy === 'popular'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
              >
                {cp.sortPopular}
              </button>
              <button
                onClick={() => setSortBy('price-asc')}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                  sortBy === 'price-asc'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
              >
                {cp.sortPriceAsc}
              </button>
              <button
                onClick={() => setSortBy('price-desc')}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                  sortBy === 'price-desc'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                }`}
              >
                {cp.sortPriceDesc}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6">
              <span className="text-[10px] uppercase tracking-widest font-bold text-stone-400">{cp.priceFilterLabel}</span>
              {[
                { id: 'all', label: cp.priceAll },
                { id: 'budget', label: cp.priceBudget },
                { id: 'mid', label: cp.priceMid },
                { id: 'premium', label: cp.priceHigh }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setPriceBand(item.id as 'all' | 'budget' | 'mid' | 'premium')}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
                    priceBand === item.id
                      ? 'bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/20 p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">{sourceNote}</p>
              <button
                onClick={() => openPartnerLink(currentAffiliateSlug)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
              >
                {sourceButtonLabel}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {filtered.map((ticket, i) => (
            <button
              key={i}
              className="group bg-white dark:bg-stone-800 rounded-2xl border border-stone-100 dark:border-stone-700 overflow-hidden hover:shadow-xl transition-all flex flex-col text-left"
            >
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
                <div className="absolute bottom-3 left-3 bg-stone-900/85 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                  #{i + 1}
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
                    <span className="text-sm font-mono font-bold text-stone-900 dark:text-white">{formatPriceJpy(ticket.priceJpy)}</span>
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
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-stone-500 dark:text-stone-400">
            {t.noItemsFound}
          </div>
        ) : null}
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

interface AffiliateCoupon {
  id: string;
  partner: string;
  code: string;
  slug: string;
  note?: string;
}

const AffiliateCouponTool = ({ onClose, language }: { onClose: () => void; language: Language }) => {
  const copyByLang = {
    vi: {
      title: 'Mã giảm giá đối tác',
      subtitle: 'Mã ưu đãi tiếp thị liên kết',
      codeLabel: 'Mã ưu đãi',
      codeMissing: 'Đang dùng link ưu đãi trực tiếp (không cần mã).',
      copyCode: 'Sao chép mã',
      copied: 'Đã sao chép',
      openLink: 'Mở ưu đãi',
      sourceNote: 'Link được mở qua thương hiệu Olachill (/go/...) để không lộ link gốc.',
      noteLabel: 'Lưu ý',
      copyPrompt: 'Không thể tự động sao chép. Hãy copy thủ công mã này:'
    },
    en: {
      title: 'Affiliate Coupons',
      subtitle: 'Affiliate promo codes',
      codeLabel: 'Promo code',
      codeMissing: 'Direct partner offer link (no code required).',
      copyCode: 'Copy code',
      copied: 'Copied',
      openLink: 'Open deal',
      sourceNote: 'Links are opened via Olachill branded route (/go/...) to hide raw affiliate URLs.',
      noteLabel: 'Note',
      copyPrompt: 'Unable to auto-copy. Please copy this code manually:'
    },
    ja: {
      title: '提携クーポン',
      subtitle: '提携プロモコード',
      codeLabel: 'クーポンコード',
      codeMissing: 'コード不要の提携リンクです。',
      copyCode: 'コードをコピー',
      copied: 'コピー済み',
      openLink: 'オファーを開く',
      sourceNote: 'リンクは Olachill のブランド導線 (/go/...) 経由で開きます。',
      noteLabel: 'メモ',
      copyPrompt: '自動コピーできませんでした。手動でコピーしてください:'
    }
  } as const;

  const t = copyByLang[language];
  const [coupons, setCoupons] = useState<AffiliateCoupon[]>([
    { id: 'klook', partner: 'Klook', code: '', slug: 'klook' },
    { id: 'kkday', partner: 'KKday', code: '', slug: 'kkday' }
  ]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/public-config')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((json) => {
        if (!active || !json) return;
        const raw = Array.isArray(json?.affiliateCoupons) ? json.affiliateCoupons : [];
        const normalized = raw
          .map((item: any) => ({
            id: String(item?.id || '').trim().toLowerCase(),
            partner: String(item?.partner || '').trim(),
            code: String(item?.code || '').trim(),
            slug: String(item?.slug || item?.id || '').trim().toLowerCase(),
            note: typeof item?.note === 'string' ? item.note.trim() : undefined
          }))
          .filter((item: AffiliateCoupon) => item.id && item.partner && item.slug);

        if (normalized.length > 0) {
          setCoupons(normalized);
        }
      })
      .catch(() => {
        // Keep default coupons.
      });

    return () => {
      active = false;
    };
  }, []);

  const openAffiliate = (slug: string) => {
    window.open(`/go/${slug}`, '_blank', 'noopener,noreferrer');
  };

  const copyCouponCode = async (item: AffiliateCoupon) => {
    if (!item.code) return;
    try {
      await navigator.clipboard.writeText(item.code);
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      window.prompt(t.copyPrompt, item.code);
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
          <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-xl flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Ticket size={20} />
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {coupons.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800/50 p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-xs uppercase tracking-widest font-bold text-stone-400">{item.partner}</p>
                <h4 className="text-2xl font-black text-stone-900 dark:text-white mt-1">{item.partner}</h4>
              </div>
              <button
                onClick={() => openAffiliate(item.slug)}
                className="shrink-0 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors flex items-center gap-1"
              >
                {t.openLink}
                <ExternalLink size={14} />
              </button>
            </div>

            <p className="text-[10px] uppercase tracking-widest font-bold text-stone-400 mb-2">{t.codeLabel}</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 px-3 py-2.5 bg-white dark:bg-stone-900">
                <p className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-300 break-all">
                  {item.code || t.codeMissing}
                </p>
              </div>
              <button
                onClick={() => copyCouponCode(item)}
                disabled={!item.code}
                className="shrink-0 px-3 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-bold text-stone-600 dark:text-stone-300 hover:border-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {copiedId === item.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copiedId === item.id ? t.copied : t.copyCode}
              </button>
            </div>

            {item.note ? (
              <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                <span className="font-bold">{t.noteLabel}: </span>
                {item.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-5">{t.sourceNote}</p>
    </motion.div>
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
  providerAmountRaw?: number;
  checkoutUrl?: string;
  providerName?: string;
  network?: string;
  speed?: string;
  coverage?: string;
  description?: string;
  basePriceJpy?: number;
  displayPriceJpy?: number;
  priceDiffJpy?: number;
  discountRate?: number;
  markupRate?: number;
  priceChangePercent?: number;
  features?: string[];
}

type EsimPaymentMethod = 'stripe' | 'paypal' | 'bank_transfer';

const EsimShop = ({
  onClose,
  language,
  fullLayout = false
}: {
  onClose: () => void;
  language: Language;
  fullLayout?: boolean;
}) => {
  const copyByLang = {
    vi: {
      title: 'eSIM du lịch',
      subtitle: 'Mua eSIM từ API nhà cung cấp thật',
      reload: 'Tải lại',
      buy: 'Chọn thanh toán',
      loading: 'Đang tải gói eSIM...',
      noPlans: 'Chưa có gói eSIM phù hợp.',
      day: 'ngày',
      heroBadge: '4G Japan eSIMs',
      instantDelivery: 'Giao eSIM số tức thì - kích hoạt trong vài phút',
      reliableCoverage: 'Phủ sóng ổn định khắp Nhật Bản',
      dataOnly: 'Chỉ dữ liệu (không thoại/SMS)',
      stayConnected: 'Giữ kết nối trong {days} ngày',
      basePrice: 'Giá gốc',
      sellPrice: 'Giá bán',
      priceGap: 'Chênh lệch',
      provider: 'Nhà cung cấp',
      sourceProvider: 'Nguồn: nhà cung cấp',
      sourceFallback: 'Nguồn: fallback local',
      providerNotConfigured: 'Server chưa bật cổng eSIM provider. Vui lòng cấu hình ESIM_PROVIDER_BASE_URL và ESIM_PROVIDER_API_KEY trên Cloud Run.',
      providerNotConfiguredShort: 'Chưa bật thanh toán eSIM',
      checkoutMissing: 'Gói này chưa có link thanh toán từ nhà cung cấp.',
      orderCreated: 'Đã tạo đơn thành công. Mã đơn: {orderId}',
      paymentTitle: 'Phương thức thanh toán',
      paymentSubtitle: 'Chọn phương thức thanh toán phù hợp',
      totalAmount: 'Tổng số tiền',
      packageLabel: 'Gói',
      selectMethod: 'Chọn phương thức thanh toán',
      methodPaypay: 'PayPay (Ví/QR Nhật Bản)',
      methodStripe: 'Stripe (Card/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: 'Chuyển khoản ngân hàng (Nhật Bản)',
      payNow: 'Thanh toán ngay',
      processing: 'Đang tạo đơn...',
      buyUnavailable: 'Tạm chưa khả dụng',
      estimatedLabel: 'Ước tính',
      usdLine: 'Giá USD'
    },
    en: {
      title: 'Travel eSIM',
      subtitle: 'Plans from your real provider API',
      reload: 'Reload',
      buy: 'Choose Payment',
      loading: 'Loading eSIM plans...',
      noPlans: 'No matching eSIM plans.',
      day: 'days',
      heroBadge: '4G Japan eSIMs',
      instantDelivery: 'Instant digital delivery - ready in minutes',
      reliableCoverage: 'Reliable coverage across Japan',
      dataOnly: 'Data only (no voice/SMS)',
      stayConnected: 'Stay connected for {days} days',
      basePrice: 'Base Price',
      sellPrice: 'Sell Price',
      priceGap: 'Gap',
      provider: 'Provider',
      sourceProvider: 'Source: provider',
      sourceFallback: 'Source: local fallback',
      providerNotConfigured: 'eSIM provider is not configured on server. Set ESIM_PROVIDER_BASE_URL and ESIM_PROVIDER_API_KEY on Cloud Run.',
      providerNotConfiguredShort: 'eSIM checkout unavailable',
      checkoutMissing: 'This plan does not include a checkout URL yet.',
      orderCreated: 'Order created successfully. Order ID: {orderId}',
      paymentTitle: 'Payment Method',
      paymentSubtitle: 'Choose the payment option that fits',
      totalAmount: 'Total Amount',
      packageLabel: 'Package',
      selectMethod: 'Choose payment method',
      methodPaypay: 'PayPay (Japan wallet/QR)',
      methodStripe: 'Stripe (Card/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: 'Bank Transfer (Japan)',
      payNow: 'Pay Now',
      processing: 'Creating order...',
      buyUnavailable: 'Unavailable',
      estimatedLabel: 'Estimated',
      usdLine: 'USD Price'
    },
    ja: {
      title: '旅行eSIM',
      subtitle: '実プロバイダーAPIのプラン',
      reload: '再読み込み',
      buy: '決済方法を選ぶ',
      loading: 'eSIMプランを読み込み中...',
      noPlans: '利用可能なeSIMプランがありません。',
      day: '日',
      heroBadge: '4G Japan eSIMs',
      instantDelivery: 'デジタル即時配信 - 数分で利用開始',
      reliableCoverage: '日本全国で安定した通信',
      dataOnly: 'データ通信専用（音声/SMSなし）',
      stayConnected: '{days}日間つながる',
      basePrice: '元価格',
      sellPrice: '販売価格',
      priceGap: '差額',
      provider: '提供元',
      sourceProvider: 'ソース: プロバイダー',
      sourceFallback: 'ソース: ローカルフォールバック',
      providerNotConfigured: 'サーバーで eSIM プロバイダーが未設定です。Cloud Run に ESIM_PROVIDER_BASE_URL と ESIM_PROVIDER_API_KEY を設定してください。',
      providerNotConfiguredShort: 'eSIM 決済は未設定です',
      checkoutMissing: 'このプランには決済URLがありません。',
      orderCreated: '注文を作成しました。注文ID: {orderId}',
      paymentTitle: 'お支払い方法',
      paymentSubtitle: '最適なお支払い方法を選択',
      totalAmount: '合計金額',
      packageLabel: 'プラン',
      selectMethod: '支払い方法を選択',
      methodPaypay: 'PayPay（日本のQRウォレット）',
      methodStripe: 'Stripe (カード/Apple Pay)',
      methodPaypal: 'PayPal',
      methodBank: '銀行振込（日本）',
      payNow: '今すぐ支払う',
      processing: '注文を作成中...',
      buyUnavailable: '利用不可',
      estimatedLabel: '概算',
      usdLine: 'USD価格'
    }
  } as const;

  const copy = copyByLang[language];
  const [plans, setPlans] = useState<EsimPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'provider' | 'local-fallback' | ''>('');
  const [providerConfigured, setProviderConfigured] = useState(true);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<EsimPlan | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<EsimPaymentMethod>('stripe');

  const paymentMethods: { key: EsimPaymentMethod; label: string; icon: React.ReactNode }[] = [
    { key: 'stripe', label: copy.methodStripe, icon: <CreditCard size={20} /> },
    { key: 'paypal', label: copy.methodPaypal, icon: <CreditCard size={20} /> },
    { key: 'bank_transfer', label: copy.methodBank, icon: <Landmark size={20} /> }
  ];

  const toBaseJpy = (plan: EsimPlan) => {
    if (typeof plan.basePriceJpy === 'number' && Number.isFinite(plan.basePriceJpy)) {
      return Math.round(plan.basePriceJpy);
    }
    if (plan.currency.toUpperCase() === 'JPY') return Math.round(plan.priceUsd);
    return Math.round(plan.priceUsd * 150);
  };

  const toDisplayJpy = (plan: EsimPlan) => {
    if (typeof plan.displayPriceJpy === 'number' && Number.isFinite(plan.displayPriceJpy)) {
      return Math.round(plan.displayPriceJpy);
    }
    return toBaseJpy(plan);
  };

  const toPriceGapJpy = (plan: EsimPlan) => {
    if (typeof plan.priceDiffJpy === 'number' && Number.isFinite(plan.priceDiffJpy)) {
      return Math.max(0, Math.round(plan.priceDiffJpy));
    }
    return Math.max(0, toDisplayJpy(plan) - toBaseJpy(plan));
  };

  const toPriceChangePercent = (plan: EsimPlan) => {
    if (typeof plan.priceChangePercent === 'number' && Number.isFinite(plan.priceChangePercent)) {
      return Math.round(plan.priceChangePercent);
    }
    const base = toBaseJpy(plan);
    const display = toDisplayJpy(plan);
    if (base <= 0) return 0;
    return Math.round(((display - base) / base) * 100);
  };

  const getPlanHighlights = (plan: EsimPlan): string[] => {
    const providerHighlights = Array.isArray(plan.features)
      ? plan.features.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const defaults = [
      copy.dataOnly,
      copy.instantDelivery,
      copy.reliableCoverage,
      copy.stayConnected.replace('{days}', String(plan.validityDays))
    ];
    const combined = [...providerHighlights, ...defaults];
    return Array.from(new Set(combined)).slice(0, 4);
  };

  const formatNumber = (value: number) => {
    const locale = language === 'vi' ? 'vi-VN' : language === 'ja' ? 'ja-JP' : 'en-US';
    return new Intl.NumberFormat(locale).format(value);
  };

  const toDisplayUsd = (plan: EsimPlan) => {
    const normalizedCurrency = String(plan.currency || '').toUpperCase();
    const amount = Number(plan.priceUsd || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    if (normalizedCurrency === 'USD') return amount;
    if (normalizedCurrency === 'JPY') return amount / 150;
    return amount;
  };

  const formatUsd = (value: number) => {
    const locale = language === 'vi' ? 'en-US' : language === 'ja' ? 'ja-JP' : 'en-US';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const loadPlans = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/esim/plans?country=JP');
      const json = await resp.json();
      setPlans(Array.isArray(json?.plans) ? json.plans : []);
      setSource(json?.source === 'provider' ? 'provider' : 'local-fallback');
      setProviderConfigured(typeof json?.providerConfigured === 'boolean' ? json.providerConfigured : json?.source === 'provider');
    } catch (e) {
      console.error(e);
      setPlans([]);
      setSource('local-fallback');
      setProviderConfigured(false);
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
    if (!providerConfigured && !plan.checkoutUrl) {
      alert(copy.providerNotConfigured);
      return;
    }
    setSelectedPlan(plan);
    setSelectedPaymentMethod('stripe');
  };

  const handleBuy = async (plan: EsimPlan, paymentMethod: EsimPaymentMethod): Promise<boolean> => {
    if (!providerConfigured && !plan.checkoutUrl) {
      alert(copy.providerNotConfigured);
      return false;
    }

    if (plan.checkoutUrl) {
      openCheckoutUrl(plan.checkoutUrl);
      return true;
    }

    try {
      setLoadingPlanId(plan.id);
      const resp = await fetch('/api/esim/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          paymentMethod
        })
      });
      const json = await resp.json();
      if (!resp.ok) {
        alert(json?.error || copy.providerNotConfigured || copy.checkoutMissing);
        return false;
      }
      if (json?.checkoutUrl) {
        openCheckoutUrl(json.checkoutUrl);
        return true;
      }
      if (json?.orderId) {
        alert(copy.orderCreated.replace('{orderId}', String(json.orderId)));
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
      className={`bg-white dark:bg-stone-900 p-4 sm:p-8 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 shadow-2xl w-full ${
        fullLayout
          ? 'max-w-none max-h-none overflow-visible'
          : 'max-w-7xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto'
      }`}
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

      {!providerConfigured && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {copy.providerNotConfigured}
        </div>
      )}

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="h-full rounded-3xl border border-sky-100 dark:border-sky-900/30 overflow-hidden bg-gradient-to-b from-sky-50/80 to-white dark:from-sky-950/30 dark:to-stone-900 shadow-[0_8px_30px_rgba(14,116,144,0.12)] flex flex-col"
            >
              <div className="bg-sky-500 dark:bg-sky-700 px-5 py-3">
                <p className="text-white font-black tracking-wide text-sm">{copy.heroBadge}</p>
              </div>
              <div className="p-5 sm:p-6 flex flex-col h-full">
                <h4 className="text-lg sm:text-xl font-black text-sky-900 dark:text-sky-200 leading-tight">
                  {plan.name} - {plan.validityDays} {copy.day}
                </h4>

                <ul className="mt-5 space-y-2.5 text-sm sm:text-base text-stone-700 dark:text-stone-200">
                  {getPlanHighlights(plan).map((line) => (
                    <li key={line} className="flex items-start gap-2.5">
                      <span className="mt-0.5 text-emerald-500">
                        <CheckCircle2 size={18} />
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 rounded-2xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-900/40 p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-2xl bg-white dark:bg-stone-900 border border-sky-200 dark:border-sky-700 flex items-center justify-center text-sky-600 dark:text-sky-300">
                        <Smartphone size={30} />
                      </div>
                      <div>
                        <p className="text-2xl sm:text-3xl font-black text-sky-900 dark:text-sky-100">{plan.data}</p>
                        <p className="text-sm sm:text-base text-stone-600 dark:text-stone-300">{plan.validityDays} {copy.day}</p>
                        {plan.providerName ? (
                          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                            {copy.provider}: <span className="font-semibold">{plan.providerName}</span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl sm:text-3xl font-black text-sky-900 dark:text-sky-100">
                        ¥{formatNumber(toDisplayJpy(plan))}
                      </p>
                      <p className="text-sm text-sky-700 dark:text-sky-300 font-semibold mt-1">
                        {copy.usdLine}: ${formatUsd(toDisplayUsd(plan))}
                      </p>
                      <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                        {copy.basePrice}: <span className="line-through">¥{formatNumber(toBaseJpy(plan))}</span>
                      </p>
                      {toPriceGapJpy(plan) > 0 ? (
                        <p className="text-xs mt-1 inline-flex px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold">
                          +¥{formatNumber(toPriceGapJpy(plan))} ({toPriceChangePercent(plan)}%) {copy.priceGap}
                        </p>
                      ) : null}
                    </div>
                  </div>
                {plan.description ? (
                  <p className="mt-3 text-xs sm:text-sm text-stone-600 dark:text-stone-300">{plan.description}</p>
                ) : null}
                </div>

                <div className="mt-5 space-y-2 mt-auto">
                  <button
                    onClick={() => openPaymentSheet(plan)}
                    disabled={loadingPlanId === plan.id || (!providerConfigured && !plan.checkoutUrl)}
                    className="w-full bg-emerald-500 text-white py-3.5 rounded-2xl text-base sm:text-lg font-black hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loadingPlanId === plan.id ? <Loader2 className="animate-spin w-4 h-4" /> : null}
                    {!providerConfigured && !plan.checkoutUrl ? copy.buyUnavailable : copy.buy}
                  </button>
                </div>
              </div>
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
              className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl"
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
                    <p className="text-3xl sm:text-5xl font-black text-stone-900 dark:text-white">{formatNumber(toDisplayJpy(selectedPlan))} JPY</p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">
                      {copy.estimatedLabel}: ${formatUsd(toDisplayUsd(selectedPlan))} USD
                    </p>
                    <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                      {copy.basePrice}: {formatNumber(toBaseJpy(selectedPlan))} JPY
                    </p>
                    {toPriceGapJpy(selectedPlan) > 0 ? (
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        +{formatNumber(toPriceGapJpy(selectedPlan))} JPY ({toPriceChangePercent(selectedPlan)}%) {copy.priceGap}
                      </p>
                    ) : null}
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
                disabled={loadingPlanId === selectedPlan.id || (!providerConfigured && !selectedPlan.checkoutUrl)}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-2xl text-base sm:text-lg font-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loadingPlanId === selectedPlan.id ? <Loader2 className="animate-spin w-5 h-5" /> : null}
                {loadingPlanId === selectedPlan.id ? copy.processing : (!providerConfigured && !selectedPlan.checkoutUrl ? copy.providerNotConfiguredShort : copy.payNow)}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

type UpgradePlanId = 'free' | 'pro' | 'vip';
type UpgradeBillingCycle = 'trial' | 'monthly' | 'yearly';

const UpgradeModal = ({ onClose, language }: { onClose: () => void; language: Language }) => {
  const supportEmail = 'lovejapan12345@gmail.com';
  const copyByLang = {
    vi: {
      title: 'Nâng cấp gói Ola',
      subtitle: 'Tăng trải nghiệm, kiểm soát chi phí và mở khóa ưu đãi độc quyền.',
      highlights: ['Lịch trình đầy đủ', 'Ưu đãi khách sạn', 'Mã giảm giá', 'Hỗ trợ chuyên gia'],
      currentPlan: 'Gói hiện tại',
      processing: 'Đang xử lý...',
      startNow: 'Bắt đầu',
      contactSupport: 'Liên hệ Email hỗ trợ',
      checkoutMissing: 'Gói này chưa có link thanh toán trực tiếp.',
      freeActivated: 'Đã chuyển về gói miễn phí 3 ngày.',
      bestValue: 'GIÁ TRỊ TỐT NHẤT',
      freeName: 'Gói miễn phí',
      proName: 'Ola Pro',
      vipName: 'Ola Vip',
      trialOptionTitle: 'Bắt đầu với bản dùng thử miễn phí 3 ngày',
      trialOptionDesc: 'Giới hạn lịch trình tối đa 3 ngày. Từ yêu cầu 5 ngày sẽ được nhắc nâng cấp.',
      yearlyOptionTitle: 'Thanh toán hàng năm',
      monthlyOptionTitle: 'Thanh toán hàng tháng',
      perMonth: '/tháng',
      planFeatureProQuestion: 'Tối đa 100 câu hỏi/tháng (quá 100 sẽ nhắc nâng cấp Ola Vip)',
      planFeatureProUnlimited: 'Lập kế hoạch không giới hạn',
      planFeatureProCoupon: 'Mã giảm giá độc quyền',
      planFeatureProHotel: 'Ưu đãi khách sạn độc quyền',
      planFeatureVipCoupon: 'Mã giảm giá độc quyền',
      planFeatureVipHotel: 'Ưu đãi khách sạn độc quyền',
      planFeatureVipPdf: 'Lưu lịch trình PDF',
      planFeatureVipExpert: 'Hỗ trợ chuyên gia',
      planFeatureVipAttraction: 'Ưu đãi vé tham quan độc quyền',
      planFeatureVipDriver: 'Hỗ trợ thuê xe an toàn sau tiệc',
      planFeatureVipPhoto: 'Chỉnh sửa ảnh cao cấp độc quyền',
      supportHint: 'Cấu hình checkout qua VITE_CHECKOUT_PRO_URL và VITE_CHECKOUT_VIP_URL (hoặc VITE_CHECKOUT_ULTRA_URL).'
    },
    en: {
      title: 'Upgrade Ola Plans',
      subtitle: 'Scale your travel experience and unlock premium perks.',
      highlights: ['Full itinerary', 'Hotel perks', 'Discount codes', 'Expert support'],
      currentPlan: 'Current plan',
      processing: 'Processing...',
      startNow: 'Start',
      contactSupport: 'Contact Support Email',
      checkoutMissing: 'No checkout URL configured for this plan.',
      freeActivated: 'Switched to free 3-day plan.',
      bestValue: 'BEST VALUE',
      freeName: 'Free Plan',
      proName: 'Ola Pro',
      vipName: 'Ola Vip',
      trialOptionTitle: 'Start with 3-day free trial',
      trialOptionDesc: 'Itinerary limit is 3 days. Requests from 5 days will trigger upgrade notice.',
      yearlyOptionTitle: 'Yearly billing',
      monthlyOptionTitle: 'Monthly billing',
      perMonth: '/month',
      planFeatureProQuestion: 'Up to 100 questions/month (after 100, prompt upgrade to Ola Vip)',
      planFeatureProUnlimited: 'Unlimited itinerary planning',
      planFeatureProCoupon: 'Exclusive discount codes',
      planFeatureProHotel: 'Exclusive hotel offers',
      planFeatureVipCoupon: 'Exclusive discount codes',
      planFeatureVipHotel: 'Exclusive hotel offers',
      planFeatureVipPdf: 'Export itinerary to PDF',
      planFeatureVipExpert: 'Expert support',
      planFeatureVipAttraction: 'Exclusive attraction ticket offers',
      planFeatureVipDriver: 'Safe self-drive support after parties',
      planFeatureVipPhoto: 'Exclusive premium photo retouching',
      supportHint: 'Configure checkout via VITE_CHECKOUT_PRO_URL and VITE_CHECKOUT_VIP_URL (or VITE_CHECKOUT_ULTRA_URL).'
    },
    ja: {
      title: 'Olaプランをアップグレード',
      subtitle: '体験を強化し、限定特典を解放します。',
      highlights: ['旅程を完全作成', 'ホテル特典', 'クーポン', '専門家サポート'],
      currentPlan: '現在のプラン',
      processing: '処理中...',
      startNow: '開始',
      contactSupport: 'サポートへメール',
      checkoutMissing: 'このプランの決済URLが未設定です。',
      freeActivated: '無料3日プランに切り替えました。',
      bestValue: '最もお得',
      freeName: '無料プラン',
      proName: 'Ola Pro',
      vipName: 'Ola Vip',
      trialOptionTitle: '3日間の無料トライアル',
      trialOptionDesc: '旅程は最大3日。5日以上の依頼ではアップグレードを案内します。',
      yearlyOptionTitle: '年払い',
      monthlyOptionTitle: '月払い',
      perMonth: '/月',
      planFeatureProQuestion: '月100件まで（100件超はOla Vipへのアップグレード案内）',
      planFeatureProUnlimited: '旅程作成は無制限',
      planFeatureProCoupon: '限定クーポンコード',
      planFeatureProHotel: '限定ホテル特典',
      planFeatureVipCoupon: '限定クーポンコード',
      planFeatureVipHotel: '限定ホテル特典',
      planFeatureVipPdf: 'PDF保存',
      planFeatureVipExpert: '専門家サポート',
      planFeatureVipAttraction: '限定チケット特典',
      planFeatureVipDriver: '飲酒後の安全運転サポート',
      planFeatureVipPhoto: '限定プレミアム写真補正',
      supportHint: 'VITE_CHECKOUT_PRO_URL と VITE_CHECKOUT_VIP_URL（または VITE_CHECKOUT_ULTRA_URL）を設定してください。'
    }
  } as const;

  const copy = copyByLang[language];
  const buildProCheckout = (import.meta as any).env?.VITE_CHECKOUT_PRO_URL || (import.meta as any).env?.VITE_CHECKOUT_BASIC_URL || '';
  const buildVipCheckout = (import.meta as any).env?.VITE_CHECKOUT_VIP_URL || (import.meta as any).env?.VITE_CHECKOUT_ULTRA_URL || '';
  const [runtimeCheckout, setRuntimeCheckout] = useState<{ pro: string; vip: string }>({
    pro: '',
    vip: ''
  });
  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<UpgradePlanId>('free');
  const [selectedBilling, setSelectedBilling] = useState<UpgradeBillingCycle>('trial');
  const [currentPlan, setCurrentPlan] = useState<UpgradePlanId>('free');

  const normalizePlan = useCallback((raw: string | null): UpgradePlanId => {
    if (raw === 'vip' || raw === 'ultra') return 'vip';
    if (raw === 'pro' || raw === 'basic') return 'pro';
    return 'free';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPlan = normalizePlan(window.localStorage.getItem('olachill_plan'));
    setCurrentPlan(savedPlan);
    setSelectedPlan(savedPlan);
    setSelectedBilling(savedPlan === 'free' ? 'trial' : 'yearly');
  }, [normalizePlan]);

  useEffect(() => {
    let active = true;
    fetch('/api/public-config')
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((json) => {
        if (!active || !json) return;
        setRuntimeCheckout({
          pro: typeof json?.checkoutProUrl === 'string' ? json.checkoutProUrl : (typeof json?.checkoutBasicUrl === 'string' ? json.checkoutBasicUrl : ''),
          vip: typeof json?.checkoutVipUrl === 'string'
            ? json.checkoutVipUrl
            : (typeof json?.checkoutUltraUrl === 'string' ? json.checkoutUltraUrl : '')
        });
      })
      .catch(() => {
        // Ignore fetch errors and keep build-time env fallback.
      });

    return () => {
      active = false;
    };
  }, []);

  const plans = {
    free: {
      id: 'free' as const,
      name: copy.freeName,
      monthly: '0$',
      yearly: '0$',
      features: [copy.trialOptionDesc]
    },
    pro: {
      id: 'pro' as const,
      name: copy.proName,
      monthly: '9.9$',
      yearly: '4.9$',
      features: [
        copy.planFeatureProUnlimited,
        copy.planFeatureProCoupon,
        copy.planFeatureProHotel,
        copy.planFeatureProQuestion
      ]
    },
    vip: {
      id: 'vip' as const,
      name: copy.vipName,
      monthly: '9.9$',
      yearly: '8.9$',
      features: [
        copy.planFeatureVipCoupon,
        copy.planFeatureVipHotel,
        copy.planFeatureVipPdf,
        copy.planFeatureVipExpert,
        copy.planFeatureVipAttraction,
        copy.planFeatureVipDriver,
        copy.planFeatureVipPhoto
      ]
    }
  };

  const resolveCheckoutUrl = (planId: UpgradePlanId, billing: UpgradeBillingCycle) => {
    if (planId === 'free') return '';
    const base = planId === 'pro'
      ? (runtimeCheckout.pro || buildProCheckout)
      : (runtimeCheckout.vip || buildVipCheckout || runtimeCheckout.pro || buildProCheckout);
    if (!base) return '';

    try {
      const url = new URL(base, window.location.origin);
      if (billing !== 'trial') {
        url.searchParams.set('billing', billing);
      }
      url.searchParams.set('plan', planId);
      return url.toString();
    } catch {
      return base;
    }
  };

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

  const handleChoosePlan = (planId: UpgradePlanId) => {
    setSelectedPlan(planId);
    setSelectedBilling(planId === 'free' ? 'trial' : 'yearly');
  };

  const handleStart = () => {
    if (processing) return;

    if (selectedPlan === 'free') {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('olachill_plan', 'free');
      }
      setCurrentPlan('free');
      alert(copy.freeActivated);
      onClose();
      return;
    }

    const checkoutUrl = resolveCheckoutUrl(selectedPlan, selectedBilling);
    if (!checkoutUrl) {
      alert(copy.checkoutMissing);
      return;
    }

    setProcessing(true);
    const opened = openCheckout(checkoutUrl);
    if (!opened) {
      setProcessing(false);
      alert(copy.checkoutMissing);
      return;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('olachill_plan', selectedPlan);
    }
    setCurrentPlan(selectedPlan);
    setTimeout(() => setProcessing(false), 1200);
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto">
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
        className="relative w-full max-w-4xl max-h-[94vh] sm:max-h-[92vh] overflow-y-auto bg-white dark:bg-stone-900 rounded-2xl sm:rounded-3xl border border-stone-100 dark:border-stone-800 p-4 sm:p-8 shadow-2xl mt-16 sm:mt-0"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800"
        >
          <X size={18} className="text-stone-400" />
        </button>

        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300 flex items-center justify-center">
            <Crown size={20} />
          </div>
          <h3 className="text-xl sm:text-2xl font-black tracking-tight dark:text-white leading-tight">{copy.title}</h3>
        </div>
        <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mb-4 sm:mb-6">{copy.subtitle}</p>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-5 sm:mb-7">
          {copy.highlights.map((item) => (
            <div
              key={item}
              className="rounded-xl sm:rounded-2xl border border-violet-100 dark:border-violet-800/40 bg-violet-50/60 dark:bg-violet-900/10 p-2.5 sm:p-4 flex items-center gap-2 sm:gap-3 min-h-[62px] sm:min-h-[auto]"
            >
              <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} />
              </span>
              <span className="font-semibold text-sm sm:text-base leading-snug text-stone-800 dark:text-stone-100">{item}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {Object.values(plans).map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const isCurrent = currentPlan === plan.id;
            return (
              <button
                key={plan.id}
                onClick={() => handleChoosePlan(plan.id)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  isSelected
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-lg font-black dark:text-white">{plan.name}</p>
                  {isCurrent ? (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-black uppercase tracking-wider">
                      {copy.currentPlan}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                  {plan.id === 'free' ? copy.trialOptionTitle : `${plan.yearly} ${copy.perMonth} • ${plan.monthly} ${copy.perMonth}`}
                </p>
              </button>
            );
          })}
        </div>

        {selectedPlan === 'free' ? (
          <div className="rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5 mb-6">
            <label className="flex items-start gap-3">
              <input type="radio" checked readOnly className="mt-1 w-5 h-5 accent-violet-600" />
              <span>
                <span className="block text-lg font-black dark:text-white">{copy.trialOptionTitle}</span>
                <span className="block text-sm text-stone-500 dark:text-stone-400 mt-1">{copy.trialOptionDesc}</span>
              </span>
            </label>
          </div>
        ) : (
          <div className="space-y-3 mb-6">
            {(['yearly', 'monthly'] as UpgradeBillingCycle[]).map((cycle) => {
              const isYearly = cycle === 'yearly';
              const active = selectedBilling === cycle;
              const plan = plans[selectedPlan];
              return (
                <button
                  key={cycle}
                  onClick={() => setSelectedBilling(cycle)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors relative ${
                    active
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                      : 'border-stone-200 dark:border-stone-700 hover:border-violet-300 dark:hover:border-violet-600'
                  }`}
                >
                  {isYearly ? (
                    <span className="absolute top-3 right-4 text-[11px] px-2 py-1 rounded-full bg-violet-600 text-white font-black">
                      {copy.bestValue}
                    </span>
                  ) : null}
                  <div className="flex items-start gap-3">
                    <input type="radio" checked={active} readOnly className="mt-1 w-5 h-5 accent-violet-600" />
                    <div className="flex-1">
                      <p className="text-xl font-black dark:text-white">
                        {isYearly ? copy.yearlyOptionTitle : copy.monthlyOptionTitle}
                      </p>
                      <p className="text-sm text-stone-500 dark:text-stone-400">
                        {isYearly ? plan.yearly : plan.monthly} {copy.perMonth}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-2xl border border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-800/40 p-4 mb-6">
          <ul className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
            {plans[selectedPlan].features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckCircle2 size={14} className="mt-0.5 text-emerald-500" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={handleStart}
          disabled={processing}
          className="w-full py-4 rounded-2xl text-lg font-black bg-violet-900 text-white hover:bg-violet-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight size={18} />}
          {processing ? copy.processing : copy.startNow}
        </button>

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            onClick={openSupportEmail}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-sm font-semibold text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
          >
            <ExternalLink size={14} />
            <span>{copy.contactSupport}</span>
          </button>
          <p className="text-xs text-stone-400 dark:text-stone-500">{copy.supportHint}</p>
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
  const [showDesktopUserMenu, setShowDesktopUserMenu] = useState(false);
  const [showMobileUserMenu, setShowMobileUserMenu] = useState(false);
  const [showMobileSettingPanel, setShowMobileSettingPanel] = useState(false);
  const [currency, setCurrency] = useState('JPY');
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');

  const t = translations[language];
  const languageOptions: { code: Language; label: string }[] = [
    { code: 'vi', label: 'Tiếng Việt' },
    { code: 'en', label: 'English' },
    { code: 'ja', label: '日本語' }
  ];
  const currencyOptions: { code: string; symbol: string; label: { vi: string; en: string; ja: string } }[] = [
    { code: 'JPY', symbol: '¥', label: { vi: 'Yên Nhật', en: 'Japanese Yen', ja: '日本円' } },
    { code: 'USD', symbol: '$', label: { vi: 'Đô la Mỹ', en: 'US Dollar', ja: '米ドル' } },
    { code: 'VND', symbol: '₫', label: { vi: 'Đồng Việt Nam', en: 'Vietnamese Dong', ja: 'ベトナムドン' } },
    { code: 'EUR', symbol: '€', label: { vi: 'Euro', en: 'Euro', ja: 'ユーロ' } },
    { code: 'GBP', symbol: '£', label: { vi: 'Bảng Anh', en: 'British Pound', ja: '英ポンド' } },
    { code: 'AUD', symbol: 'A$', label: { vi: 'Đô la Úc', en: 'Australian Dollar', ja: '豪ドル' } },
    { code: 'CAD', symbol: 'C$', label: { vi: 'Đô la Canada', en: 'Canadian Dollar', ja: 'カナダドル' } },
    { code: 'SGD', symbol: 'S$', label: { vi: 'Đô la Singapore', en: 'Singapore Dollar', ja: 'シンガポールドル' } },
    { code: 'HKD', symbol: 'HK$', label: { vi: 'Đô la Hồng Kông', en: 'Hong Kong Dollar', ja: '香港ドル' } },
    { code: 'KRW', symbol: '₩', label: { vi: 'Won Hàn Quốc', en: 'South Korean Won', ja: '韓国ウォン' } },
    { code: 'CNY', symbol: '¥', label: { vi: 'Nhân dân tệ', en: 'Chinese Yuan', ja: '人民元' } },
    { code: 'THB', symbol: '฿', label: { vi: 'Baht Thái', en: 'Thai Baht', ja: 'タイバーツ' } },
    { code: 'TWD', symbol: 'NT$', label: { vi: 'Đô la Đài Loan', en: 'New Taiwan Dollar', ja: '台湾ドル' } },
    { code: 'MYR', symbol: 'RM', label: { vi: 'Ringgit Malaysia', en: 'Malaysian Ringgit', ja: 'マレーシアリンギット' } },
    { code: 'PHP', symbol: '₱', label: { vi: 'Peso Philippines', en: 'Philippine Peso', ja: 'フィリピンペソ' } },
    { code: 'IDR', symbol: 'Rp', label: { vi: 'Rupiah Indonesia', en: 'Indonesian Rupiah', ja: 'インドネシアルピア' } },
    { code: 'INR', symbol: '₹', label: { vi: 'Rupee Ấn Độ', en: 'Indian Rupee', ja: 'インドルピー' } },
    { code: 'AED', symbol: 'د.إ', label: { vi: 'Dirham UAE', en: 'UAE Dirham', ja: 'UAEディルハム' } },
    { code: 'CHF', symbol: 'CHF', label: { vi: 'Franc Thụy Sĩ', en: 'Swiss Franc', ja: 'スイスフラン' } },
    { code: 'BRL', symbol: 'R$', label: { vi: 'Real Brazil', en: 'Brazilian Real', ja: 'ブラジルレアル' } }
  ];
  const majorCurrencyCycle = ['JPY', 'USD', 'VND'];
  const currentCurrencyInfo = currencyOptions.find((item) => item.code === currency);
  const mobileMenuVersionLabel = 'V1.1.3-JP';
  const aboutLabel = language === 'vi' ? 'Giới thiệu' : language === 'ja' ? '紹介' : 'About';
  const esimPaymentLabel = language === 'vi' ? 'Thanh toán eSIM' : language === 'ja' ? 'eSIM決済' : 'eSIM Payment';
  const couponDealsLabel = language === 'vi' ? 'Mã giảm giá' : language === 'ja' ? 'クーポン' : 'Coupon Deals';
  const mobileLoginLabel = language === 'vi' ? 'Đăng nhập' : language === 'ja' ? 'ログイン' : 'Login';
  const settingsLabel = language === 'vi' ? 'Cài đặt' : language === 'ja' ? '設定' : 'Settings';
  const manageSubscriptionLabel = language === 'vi' ? 'Quản lý gói' : language === 'ja' ? 'プラン管理' : 'Manage Subscription';
  const myTripsLabel = language === 'vi' ? 'Chuyến đi của tôi' : language === 'ja' ? 'マイトリップ' : 'My Trips';
  const currencyLabel = language === 'vi' ? `Tiền tệ (${currency})` : language === 'ja' ? `通貨 (${currency})` : `Currency (${currency})`;
  const currencyListLabel = language === 'vi' ? 'Danh sách tiền tệ' : language === 'ja' ? '通貨リスト' : 'Currency List';
  const languageLabel = language === 'vi' ? 'Ngôn ngữ' : language === 'ja' ? '言語' : 'Language';
  const temperatureLabel = language === 'vi' ? `Nhiệt độ (°${temperatureUnit})` : language === 'ja' ? `温度 (°${temperatureUnit})` : `Temperature (°${temperatureUnit})`;
  const currencySymbol = currentCurrencyInfo?.symbol || currency;
  const languageBadge = language === 'vi' ? '🇻🇳' : language === 'ja' ? '🇯🇵' : '🇺🇸';
  const cycleCurrency = () => {
    setCurrency((prev) => {
      const currentIndex = majorCurrencyCycle.indexOf(prev);
      if (currentIndex < 0) return majorCurrencyCycle[0];
      return majorCurrencyCycle[(currentIndex + 1) % majorCurrencyCycle.length];
    });
  };
  const cycleLanguage = () => {
    setLanguage((prev) => (prev === 'vi' ? 'en' : prev === 'en' ? 'ja' : 'vi'));
  };
  const cycleTemperature = () => {
    setTemperatureUnit((prev) => (prev === 'C' ? 'F' : 'C'));
  };
  const sessionsStorageKey = 'olachill_sessions';
  const legacySessionsStorageKey = 'japan_ai_sessions';
  const aiProcessingLabel = language === 'vi' ? `${t.appName} đang xử lý...` : language === 'ja' ? `${t.appName} が処理中...` : `${t.appName} is processing...`;
  const aiOptimizingLabel = language === 'vi' ? 'Đang tối ưu hóa lịch trình' : language === 'ja' ? '旅程を最適化中' : 'Optimizing itinerary';
  const loggedInLabel = language === 'vi' ? 'Đã đăng nhập' : language === 'ja' ? 'ログイン済み' : 'Signed in';
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
  const utilityTopics = suggestedTopics.filter((topic: any) => topic.utility && topic.utility !== 'coupons');

  const [activeUtility, setActiveUtility] = useState<null | 'train' | 'tickets' | 'esim' | 'coupons'>(null);
  const isUtilityFullscreen = activeUtility === 'train' || activeUtility === 'tickets';
  const isUtilityWideLayout = isUtilityFullscreen || activeUtility === 'esim';
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [currentSubscriptionPlan, setCurrentSubscriptionPlan] = useState<UpgradePlanId>('free');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginPending, setLoginPending] = useState(false);
  const [userPrefs, setUserPrefs] = useState<any>(null);
  const loginAlertShownRef = useRef(false);
  const planStorageKey = 'olachill_plan';
  const questionUsageStorageKey = 'olachill_question_usage';

  const getLoginErrorMessage = (error: any) => {
    const code = String(error?.code || '');
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current-domain';
    const requiredDomains = Array.from(new Set(['olachill.com', 'www.olachill.com', currentHost])).join(', ');
    if (language === 'vi') {
      if (code === 'auth/unauthorized-domain') return `Domain "${currentHost}" chưa được bật trong Firebase Auth. Hãy thêm vào Authorized domains: ${requiredDomains}`;
      if (code === 'auth/operation-not-allowed') return 'Google Sign-In chưa bật trong Firebase Authentication.';
      if (code === 'auth/invalid-api-key') return 'Firebase API key không hợp lệ.';
      if (code === 'auth/network-request-failed') return 'Lỗi mạng khi đăng nhập. Vui lòng thử lại.';
      if (code === 'auth/popup-blocked') return 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.';
      if (code === 'auth/popup-closed-by-user') return 'Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.';
      if (code === 'auth/invalid-continue-uri' || code === 'auth/invalid-action-code') return 'Liên kết đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng thử đăng nhập lại.';
      if (code === 'auth/invalid-oauth-client-id') return 'OAuth Client ID của Firebase/Google Sign-In đang sai cấu hình.';
      return 'Đăng nhập thất bại. Vui lòng thử lại.';
    }
    if (language === 'ja') {
      if (code === 'auth/unauthorized-domain') return `Firebase Auth の許可ドメインに "${currentHost}" が未登録です。追加するドメイン: ${requiredDomains}`;
      if (code === 'auth/operation-not-allowed') return 'Firebase Authentication で Google ログインが有効化されていません。';
      if (code === 'auth/invalid-api-key') return 'Firebase API キーが無効です。';
      if (code === 'auth/network-request-failed') return 'ネットワークエラーのためログインできません。';
      if (code === 'auth/popup-blocked') return 'ブラウザがログイン用ポップアップをブロックしました。許可して再試行してください。';
      if (code === 'auth/popup-closed-by-user') return 'ログイン完了前にポップアップが閉じられました。';
      if (code === 'auth/invalid-continue-uri' || code === 'auth/invalid-action-code') return 'ログインリンクが無効または期限切れです。もう一度ログインしてください。';
      if (code === 'auth/invalid-oauth-client-id') return 'Firebase/Google Sign-In の OAuth Client ID 設定が正しくありません。';
      return 'ログインに失敗しました。再試行してください。';
    }
    if (code === 'auth/unauthorized-domain') return `This domain "${currentHost}" is not authorized in Firebase Auth. Add these domains: ${requiredDomains}`;
    if (code === 'auth/operation-not-allowed') return 'Google Sign-In is not enabled in Firebase Authentication.';
    if (code === 'auth/invalid-api-key') return 'Invalid Firebase API key.';
    if (code === 'auth/network-request-failed') return 'Network error while signing in. Please try again.';
    if (code === 'auth/popup-blocked') return 'Your browser blocked the login popup. Please allow popups and try again.';
    if (code === 'auth/popup-closed-by-user') return 'Login popup was closed before sign-in completed.';
    if (code === 'auth/invalid-continue-uri' || code === 'auth/invalid-action-code') return 'Login link is invalid or expired. Please try signing in again.';
    if (code === 'auth/invalid-oauth-client-id') return 'Firebase/Google Sign-In OAuth client ID is misconfigured.';
    return 'Login failed. Please try again.';
  };

  const handleLogin = async () => {
    if (loginPending) return;
    setLoginPending(true);
    try {
      const loginUser = await loginWithGoogle();
      if (loginUser) {
        setUser(loginUser);
        setAuthLoading(false);
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert(getLoginErrorMessage(error));
      setLoginPending(false);
    }
  };

  useEffect(() => {
    consumeRedirectLoginResult()
      .then((redirectUser) => {
        if (redirectUser) {
          setUser(redirectUser);
          setAuthLoading(false);
        }
      })
      .catch((error) => {
        if (loginAlertShownRef.current) return;
        loginAlertShownRef.current = true;
        alert(getLoginErrorMessage(error));
      });
  // Run once on mount to finalize any pending redirect auth result.
  // Re-running on language switch can cause duplicate alert noise.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
      setLoginPending(false);
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

  const scrollToSection = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 140);
  };

  const scrollToSectionFromMenu = (id: string) => {
    setShowMobileMenu(false);
    scrollToSection(id);
  };

  const scrollToSectionFromDesktopMenu = (id: string) => {
    setShowDesktopUserMenu(false);
    scrollToSection(id);
  };

  const scrollToSectionFromMobileUserMenu = (id: string) => {
    setShowMobileUserMenu(false);
    scrollToSection(id);
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

  const normalizePlan = useCallback((raw: string | null): UpgradePlanId => {
    if (raw === 'vip' || raw === 'ultra') return 'vip';
    if (raw === 'pro' || raw === 'basic') return 'pro';
    return 'free';
  }, []);

  const getLocalDateKey = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getDailyQuestionUsage = () => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.localStorage.getItem(questionUsageStorageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { date?: string; count?: number };
      if (parsed?.date !== getLocalDateKey()) return 0;
      const count = Number(parsed?.count || 0);
      return Number.isFinite(count) && count > 0 ? count : 0;
    } catch {
      return 0;
    }
  };

  const increaseDailyQuestionUsage = () => {
    if (typeof window === 'undefined') return;
    try {
      const nextCount = getDailyQuestionUsage() + 1;
      window.localStorage.setItem(questionUsageStorageKey, JSON.stringify({
        date: getLocalDateKey(),
        count: nextCount
      }));
    } catch {
      // Keep app functional even when storage is blocked.
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncPlan = () => {
      setCurrentSubscriptionPlan(normalizePlan(window.localStorage.getItem(planStorageKey)));
    };
    syncPlan();
    window.addEventListener('storage', syncPlan);
    window.addEventListener('focus', syncPlan);
    return () => {
      window.removeEventListener('storage', syncPlan);
      window.removeEventListener('focus', syncPlan);
    };
  }, [normalizePlan]);

  const detectRequestedDays = (text: string): number => {
    const normalized = String(text || '');
    const match = normalized.match(/(\d+)\s*(ngày|day|days|日)/i);
    if (!match) return 0;
    const value = Number(match[1] || 0);
    return Number.isFinite(value) ? value : 0;
  };

  const freePlanBlockedMessage = language === 'vi'
    ? 'Gói miễn phí chỉ hỗ trợ lịch trình tối đa 3 ngày. Với yêu cầu từ 5 ngày, vui lòng nâng cấp Ola Pro hoặc Ola Vip.'
    : language === 'ja'
      ? '無料プランは最大3日までです。5日以上の旅程は Ola Pro または Ola Vip にアップグレードしてください。'
      : 'Free plan supports up to 3-day itineraries. For 5+ day requests, please upgrade to Ola Pro or Ola Vip.';

  const proPlanLimitMessage = language === 'vi'
    ? 'Bạn đã vượt 100 câu hỏi trong gói Ola Pro. Vui lòng nâng cấp Ola Vip để tiếp tục.'
    : language === 'ja'
      ? 'Ola Pro の100質問上限に達しました。続行するには Ola Vip へアップグレードしてください。'
      : 'You reached 100-question limit on Ola Pro. Please upgrade to Ola Vip to continue.';

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

    const requestedDays = detectRequestedDays(userPrompt);
    if (currentSubscriptionPlan === 'free' && requestedDays >= 5) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        return [...filtered, {
          id: Date.now().toString(),
          type: 'error',
          content: freePlanBlockedMessage,
          timestamp: new Date()
        }];
      });
      setLoading(false);
      setShowUpgradeModal(true);
      return;
    }

    const dailyUsage = getDailyQuestionUsage();
    if (currentSubscriptionPlan === 'pro' && dailyUsage >= 100) {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingMessage.id);
        return [...filtered, {
          id: Date.now().toString(),
          type: 'error',
          content: proPlanLimitMessage,
          timestamp: new Date()
        }];
      });
      setLoading(false);
      setShowUpgradeModal(true);
      return;
    }

    increaseDailyQuestionUsage();

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
      <nav className="fixed top-0 left-0 right-0 h-20 bg-white/85 dark:bg-stone-900/85 backdrop-blur-md z-50 border-b border-stone-100 dark:border-stone-800 px-4 md:px-6 flex items-center justify-between overflow-visible">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => {
              setShowMobileUserMenu(true);
              setShowMobileSettingPanel(false);
              setShowMobileMenu(false);
              setShowLanguageMenu(false);
              setShowDesktopUserMenu(false);
            }}
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
            <button
              onClick={() => {
                setShowMobileUserMenu(true);
                setShowLanguageMenu(false);
                setShowDesktopUserMenu(false);
                setShowMobileMenu(false);
              }}
              className="h-10 px-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 flex items-center gap-1.5"
              title={settingsLabel}
            >
              {authLoading ? (
                <Loader2 className="animate-spin text-stone-400" size={16} />
              ) : user ? (
                <img
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`}
                  alt={user.displayName || 'User'}
                  className="w-6 h-6 rounded-full border border-stone-200 dark:border-stone-700 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <User size={16} className="text-stone-500 dark:text-stone-300" />
              )}
              <ChevronDown size={14} className="text-stone-400" />
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
                onClick={() => {
                  setShowLanguageMenu((prev) => !prev);
                  setShowDesktopUserMenu(false);
                }}
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

            <div className="relative pl-2 border-l border-stone-100 dark:border-stone-800">
              <button
                onClick={() => {
                  setShowDesktopUserMenu((prev) => !prev);
                  setShowLanguageMenu(false);
                }}
                className="h-10 pl-2 pr-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors flex items-center gap-2"
              >
                {authLoading ? (
                  <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center">
                    <Loader2 className="animate-spin text-stone-400" size={14} />
                  </div>
                ) : user ? (
                  <img
                    src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`}
                    alt={user.displayName || 'User'}
                    className="w-7 h-7 rounded-full border border-stone-200 dark:border-stone-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center">
                    <User size={14} className="text-stone-500 dark:text-stone-300" />
                  </div>
                )}
                <ChevronDown size={15} className={`text-stone-400 transition-transform ${showDesktopUserMenu ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {showDesktopUserMenu && (
                  <>
                    <motion.button
                      type="button"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowDesktopUserMenu(false)}
                      className="fixed inset-0 z-[58] cursor-default"
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      className="absolute right-0 mt-2 w-[320px] bg-white/95 dark:bg-stone-900/95 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl backdrop-blur-md z-[60] overflow-hidden"
                    >
                      <div className="px-4 pt-3 pb-2 border-b border-stone-100 dark:border-stone-800">
                        <div className="inline-flex items-center rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-900">
                          <button
                            onClick={cycleCurrency}
                            className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                            title={currencyLabel}
                          >
                            {currencySymbol}
                          </button>
                          <button
                            onClick={cycleLanguage}
                            className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 border-l border-r border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                            title={languageLabel}
                          >
                            {languageBadge}
                          </button>
                          <button
                            onClick={cycleTemperature}
                            className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                            title={temperatureLabel}
                          >
                            °{temperatureUnit}
                          </button>
                        </div>
                      </div>

                      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                        <p className="text-xs uppercase tracking-[0.22em] font-black text-stone-400 dark:text-stone-500">Olachill</p>
                        <p className="text-sm font-bold text-stone-900 dark:text-white mt-1 truncate">
                          {user?.displayName || user?.email || 'Guest'}
                        </p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">5 lượt/ngày</p>
                      </div>

                      <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] uppercase tracking-[0.16em] font-black text-stone-400 dark:text-stone-500 mb-2">
                          {currencyListLabel}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                          {currencyOptions.map((option) => (
                            <button
                              key={`desktop-currency-${option.code}`}
                              onClick={() => setCurrency(option.code)}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                currency === option.code
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-400/60'
                              }`}
                              title={option.label[language]}
                            >
                              {option.code}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="p-2 space-y-1">
                        {authLoading ? (
                          <button
                            disabled
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-stone-400"
                          >
                            <Loader2 size={16} className="animate-spin" />
                            ...
                          </button>
                        ) : user ? (
                          <button
                            onClick={() => {
                              setShowDesktopUserMenu(false);
                              void logout();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                          >
                            <LogOut size={18} className="text-stone-500 dark:text-stone-400" />
                            {t.logout}
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setShowDesktopUserMenu(false);
                              void handleLogin();
                            }}
                            disabled={loginPending}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                          >
                            {loginPending ? <Loader2 size={18} className="animate-spin text-stone-500 dark:text-stone-400" /> : <LogIn size={18} className="text-stone-500 dark:text-stone-400" />}
                            {loginPending ? (language === 'vi' ? 'Đang đăng nhập...' : language === 'ja' ? 'ログイン中...' : 'Signing in...') : t.login}
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setShowDesktopUserMenu(false);
                            clearChat();
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <Plus size={18} className="text-stone-500 dark:text-stone-400" />
                          {t.newChat}
                        </button>

                        <button
                          onClick={() => {
                            setShowDesktopUserMenu(false);
                            setShowUpgradeModal(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <Crown size={18} className="text-stone-500 dark:text-stone-400" />
                          {manageSubscriptionLabel}
                        </button>

                        <button
                          onClick={() => {
                            setShowDesktopUserMenu(false);
                            setShowLanguageMenu(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <Settings size={18} className="text-stone-500 dark:text-stone-400" />
                          {settingsLabel}
                        </button>
                      </div>

                      <div className="mx-2 border-t border-stone-100 dark:border-stone-800" />

                      <div className="p-2 space-y-1">
                        <button
                          onClick={() => scrollToSectionFromDesktopMenu('footer-about')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <Info size={18} className="text-stone-500 dark:text-stone-400" />
                          {aboutLabel}
                        </button>

                        <button
                          onClick={() => scrollToSectionFromDesktopMenu('footer-support')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <MessageSquare size={18} className="text-stone-500 dark:text-stone-400" />
                          {t.contact}
                        </button>

                        <button
                          onClick={() => scrollToSectionFromDesktopMenu('footer-support')}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          <FileText size={18} className="text-stone-500 dark:text-stone-400" />
                          {t.terms}
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Search Overlay */}
      <AnimatePresence>
        {showMobileUserMenu && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowMobileUserMenu(false);
                setShowMobileSettingPanel(false);
              }}
              className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[58] md:hidden cursor-default"
            />
            <motion.div
              initial={{ y: '100%', opacity: 0.95 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="fixed left-0 right-0 bottom-0 max-h-[82vh] bg-white dark:bg-stone-900 rounded-t-[28px] z-[60] md:hidden border-t border-stone-200 dark:border-stone-800 shadow-2xl overflow-y-auto"
            >
              <div className="py-3 flex justify-center">
                <div className="w-14 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700" />
              </div>

              <div className="px-5 pb-3 flex justify-end">
                <div className="inline-flex items-center rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden bg-white dark:bg-stone-900">
                  <button
                    onClick={cycleCurrency}
                    className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    title={currencyLabel}
                  >
                    {currencySymbol}
                  </button>
                  <button
                    onClick={cycleLanguage}
                    className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 border-l border-r border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    title={languageLabel}
                  >
                    {languageBadge}
                  </button>
                  <button
                    onClick={cycleTemperature}
                    className="px-3 py-1.5 text-sm font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                    title={temperatureLabel}
                  >
                    °{temperatureUnit}
                  </button>
                </div>
              </div>

              <div className="px-5 pb-4 border-b border-stone-100 dark:border-stone-800">
                {authLoading ? (
                  <div className="flex items-center gap-3 text-stone-400 py-2">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="text-sm">...</span>
                  </div>
                ) : user ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`}
                      alt={user.displayName || 'User'}
                      className="w-12 h-12 rounded-full border border-stone-200 dark:border-stone-700"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-stone-900 dark:text-white truncate">{user.displayName || 'User'}</p>
                      <p className="text-sm text-stone-500 dark:text-stone-400 truncate">{user.email || ''}</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowMobileUserMenu(false);
                      void handleLogin();
                    }}
                    disabled={loginPending}
                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loginPending ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
                    {mobileLoginLabel}
                  </button>
                )}
              </div>

              <div className="p-3">
                <button
                  onClick={() => {
                    setShowMobileUserMenu(false);
                    clearChat();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <Plus size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{t.newChat}</span>
                </button>

                <button
                  onClick={() => {
                    setShowMobileUserMenu(false);
                    setShowSavedPlans(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <MapPin size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{myTripsLabel}</span>
                </button>

                <button
                  onClick={() => {
                    setShowMobileUserMenu(false);
                    setShowUpgradeModal(true);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <Crown size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{manageSubscriptionLabel}</span>
                </button>

                <button
                  onClick={() => setShowMobileSettingPanel((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <span className="inline-flex items-center gap-3">
                    <Settings size={20} className="text-stone-500 dark:text-stone-400" />
                    <span className="font-semibold">{settingsLabel}</span>
                  </span>
                  <ChevronDown size={16} className={`text-stone-400 transition-transform ${showMobileSettingPanel ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence initial={false}>
                  {showMobileSettingPanel && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="ml-6 mt-1 mb-2 border-l border-stone-200 dark:border-stone-700 pl-3 space-y-1"
                    >
                      <div className="px-2 py-2">
                        <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300 mb-2">
                          <CircleDollarSign size={18} className="text-stone-400" />
                          <span className="text-sm font-medium">{currencyLabel}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {currencyOptions.map((option) => (
                            <button
                              key={`mobile-currency-${option.code}`}
                              onClick={() => setCurrency(option.code)}
                              className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                currency === option.code
                                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                                  : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:border-emerald-400/60'
                              }`}
                              title={option.label[language]}
                            >
                              {option.code}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 px-2 py-2 text-stone-700 dark:text-stone-300">
                        <Thermometer size={18} className="text-stone-400" />
                        <span className="text-sm font-medium">{temperatureLabel}</span>
                      </div>
                      <div className="px-2 py-2">
                        <div className="flex items-center gap-2 text-stone-700 dark:text-stone-300 mb-2">
                          <Languages size={18} className="text-stone-400" />
                          <span className="text-sm font-medium">{languageLabel}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {languageOptions.map((item) => (
                            <button
                              key={`mobile-lang-${item.code}`}
                              onClick={() => setLanguage(item.code)}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                language === item.code
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="my-2 border-t border-stone-100 dark:border-stone-800" />

                <button
                  onClick={() => scrollToSectionFromMobileUserMenu('footer-about')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <Info size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{aboutLabel}</span>
                </button>

                <button
                  onClick={() => scrollToSectionFromMobileUserMenu('footer-support')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <MessageSquare size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{t.contact}</span>
                </button>

                <button
                  onClick={() => scrollToSectionFromMobileUserMenu('footer-support')}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                >
                  <FileText size={20} className="text-stone-500 dark:text-stone-400" />
                  <span className="font-semibold">{t.terms}</span>
                </button>

                {user ? (
                  <button
                    onClick={() => {
                      setShowMobileUserMenu(false);
                      void logout();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors mt-1"
                  >
                    <LogOut size={20} />
                    <span className="font-semibold">{t.logout}</span>
                  </button>
                ) : null}
              </div>
            </motion.div>
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

      <main
        className={`flex-1 pt-28 sm:pt-32 pb-32 w-full relative overflow-x-hidden mx-auto ${
          isUtilityWideLayout ? 'max-w-[1700px] px-2 sm:px-5' : 'max-w-5xl px-4 sm:px-6'
        }`}
      >
        {messages.length === 0 ? (
          /* Hero Section */
          <div className={`flex flex-col ${isUtilityFullscreen ? 'items-stretch text-left py-2' : 'items-center text-center py-12'}`}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`w-full px-1 sm:px-0 overflow-x-hidden ${isUtilityWideLayout ? 'max-w-full' : 'max-w-3xl mx-auto'}`}
            >
              {!isUtilityFullscreen ? (
                <h1 className="hidden md:block text-7xl font-serif leading-[1.1] mb-8 dark:text-white break-words [overflow-wrap:anywhere]">
                  {t.heroTitle}
                  {t.heroSubtitle ? (
                    <span className="block italic text-emerald-600 dark:text-emerald-400 mt-1">{t.heroSubtitle}</span>
                  ) : null}
                </h1>
              ) : null}

              <AnimatePresence mode="wait">
                {activeUtility ? (
                  <div className={`mb-12 ${isUtilityWideLayout ? 'w-full' : 'flex justify-center'}`}>
                    {activeUtility === 'train' && (
                      <TrainSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                        fullLayout={isUtilityFullscreen}
                      />
                    )}
                    {activeUtility === 'tickets' && (
                      <TicketSearch 
                        onClose={() => setActiveUtility(null)} 
                        language={language}
                        fullLayout={isUtilityFullscreen}
                      />
                    )}
                    {activeUtility === 'esim' && (
                      <EsimShop
                        onClose={() => setActiveUtility(null)}
                        language={language}
                        fullLayout={activeUtility === 'esim'}
                      />
                    )}
                    {activeUtility === 'coupons' && (
                      <AffiliateCouponTool
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

                        <div className="mb-6 flex flex-col items-start gap-2.5">
                          {utilityTopics.map((topic: any) => (
                            <button
                              key={topic.utility}
                              onClick={() => setActiveUtility(topic.utility as any)}
                              className={`inline-flex items-center gap-2.5 rounded-full px-4 py-3 border shadow-md transition-all ${
                                activeUtility === topic.utility
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white/95 dark:bg-stone-900/95 border-stone-200 dark:border-stone-700 text-stone-800 dark:text-stone-100 hover:border-emerald-500/50'
                              }`}
                            >
                              <span className="text-lg leading-none">{topic.icon}</span>
                              <span className="text-[20px] leading-none font-medium">{topic.text}</span>
                            </button>
                          ))}
                        </div>

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
              
              {!isUtilityFullscreen ? (
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
              ) : null}
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
      <div className="hidden md:block fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-8 left-0 right-0 z-40 pointer-events-none">
        <div className="max-w-4xl mx-auto px-3 pointer-events-auto overflow-hidden">
          <div className="mx-auto flex w-fit max-w-full gap-2 justify-center overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pb-1 pr-1">
          {utilityTopics.map((topic: any) => (
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
