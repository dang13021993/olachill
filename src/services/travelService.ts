import { GoogleGenAI, Type } from "@google/genai";
import { db, OperationType, handleFirestoreError } from "../firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";

const GEMINI_KEY = 
  process.env.GEMINI_API_KEY || 
  (import.meta as any).env?.VITE_GEMINI_API_KEY || 
  '';

const USE_SERVER_AI_ONLY = true;
const DIRECT_GEMINI_MODEL = (import.meta as any).env?.VITE_GEMINI_MODEL || 'gemini-1.5-flash';

const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

const mapServerAiErrorMessage = (rawMessage: string, language: 'en' | 'ja' | 'vi') => {
  const raw = String(rawMessage || '').toLowerCase();
  const quotaLike = raw.includes('quota') || raw.includes('429') || raw.includes('resource_exhausted') || raw.includes('rate limit');
  const modelLike = raw.includes('model') || raw.includes('all configured ai models failed') || raw.includes('not found');
  const keyLike = raw.includes('gemini_api_key') || raw.includes('api key');

  if (quotaLike || modelLike || keyLike) {
    if (language === 'ja') {
      return 'AIが混雑中のため、暫定プランを表示しました。数分後に再生成すると改善する場合があります。';
    }
    if (language === 'en') {
      return 'AI is currently overloaded, so a fallback plan was shown. Please retry in a few minutes.';
    }
    return 'AI đang quá tải, hệ thống đã hiển thị kế hoạch dự phòng. Bạn thử lại sau vài phút nhé.';
  }

  if (language === 'ja') return 'サーバーAI接続エラー。しばらくして再試行してください。';
  if (language === 'en') return 'Server AI connection error. Please try again shortly.';
  return 'Lỗi kết nối AI phía máy chủ. Vui lòng thử lại sau.';
};

const parseApiErrorMessage = async (resp: Response, language: 'en' | 'ja' | 'vi') => {
  try {
    const data = await resp.json();
    if (typeof data?.error === "string" && data.error.trim()) {
      return mapServerAiErrorMessage(data.error, language);
    }
  } catch {
    // Ignore JSON parse errors and fallback below.
  }
  return mapServerAiErrorMessage(`Request failed with status ${resp.status}`, language);
};

const generateTravelPlanViaServer = async (
  prompt: string,
  history: { role: 'user' | 'model', text: string }[],
  language: 'en' | 'ja' | 'vi'
): Promise<TravelPlan> => {
  const resp = await fetch('/api/travel/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history, language })
  });

  if (!resp.ok) {
    throw new Error(await parseApiErrorMessage(resp, language));
  }

  return await resp.json() as TravelPlan;
};

const getPlaceInfoViaServer = async (placeName: string, language: 'en' | 'ja' | 'vi') => {
  const resp = await fetch('/api/travel/place-info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ placeName, language })
  });

  if (!resp.ok) {
    return { text: "Could not get information.", grounding: [] };
  }

  return await resp.json();
};

// Simple hash function for prompt
const hashPrompt = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

export interface ItineraryItem {
  time: string;
  activity: string;
  location: string;
  description: string;
  googleMapsUrl?: string;
}

export interface DayPlan {
  day: number;
  title: string;
  activities: ItineraryItem[];
}

export interface ItinerarySummary {
  day: string;
  area: string;
  focus: string;
}

export interface HotelInfo {
  name: string;
  area: string;
  priceRange: string;
  description: string;
  bookingUrl?: string;
}

export interface TicketInfo {
  name: string;
  price: string;
  bookingPoint: string;
  note: string;
}

export interface TransportationInfo {
  type: string;
  provider: string;
  price: string;
  details: string;
}

export interface EventInfo {
  name: string;
  date: string;
  location: string;
  description: string;
  type: string;
}

export interface Suggestion {
  title: string;
  description: string;
  query: string;
  icon: string;
}

export interface TravelPlan {
  type: 'plan' | 'chat';
  destination: string;
  summary: string;
  itinerarySummary?: ItinerarySummary[];
  days: DayPlan[];
  tips: string[];
  hotels?: HotelInfo[];
  tickets?: TicketInfo[];
  transportation?: TransportationInfo[];
  events?: EventInfo[];
  suggestions: Suggestion[];
}

export const generateTravelPlan = async (
  prompt: string, 
  userId?: string,
  userEmail?: string | null,
  history: { role: 'user' | 'model', text: string }[] = [],
  onChunk?: (text: string) => void,
  language: 'en' | 'ja' | 'vi' = 'vi'
): Promise<TravelPlan> => {
  const promptHash = hashPrompt(prompt + (history.length > 0 ? history[history.length - 1].text : '') + language);
  const cacheRef = doc(db, "plans", promptHash);

  // 1. Check Cache (Re-enabled for performance)
  try {
    const cacheSnap = await getDoc(cacheRef);
    if (cacheSnap.exists()) {
      console.log("Using cached plan for:", promptHash);
      const cachedData = cacheSnap.data();
      // If cached for more than 24h, we might want to refresh, but for now just return
      return cachedData.plan as TravelPlan;
    }
  } catch (error) {
    console.warn("Cache check failed:", error);
  }

  // 2. Check Rate Limit (if user is logged in)
  if (userId) {
    const userRef = doc(db, "users", userId);
    const today = new Date().toISOString().split('T')[0];
    
    try {
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : null;
      const lastDate = userData?.lastUsageDate;
      const count = userData?.dailyUsageCount || 0;
      const isAdmin = userData?.role === 'admin' || userEmail === 'lovejapan12345@gmail.com' || userEmail === 'saigonpension2025@gmail.com';

      if (!isAdmin && lastDate === today && count >= 1000) {
        const limitMsg = language === 'ja' ? "本日のプラン作成回数制限（1000回）に達しました。明日またお越しください！" : 
                        language === 'en' ? "You have reached your daily limit for creating itineraries (1000 times). Please come back tomorrow!" :
                        "Bạn đã hết lượt tạo lịch trình hôm nay (Giới hạn 1000 lượt/ngày). Vui lòng quay lại vào ngày mai!";
        throw new Error(limitMsg);
      }

      // Update usage count asynchronously to not block the AI call
      const newCount = lastDate === today ? count + 1 : 1;
      const updatePromise = userSnap.exists() 
        ? updateDoc(userRef, { dailyUsageCount: newCount, lastUsageDate: today })
        : setDoc(userRef, { uid: userId, email: userEmail || 'unknown', dailyUsageCount: 1, lastUsageDate: today, role: 'user', createdAt: serverTimestamp() });
      
      updatePromise.catch(e => console.error("Failed to update usage:", e));
    } catch (error) {
      if (error instanceof Error && error.message.includes("limit")) throw error;
      console.warn("Rate limit check failed, continuing anyway:", error);
    }
  }

  console.log("Generating NEW travel plan for:", prompt, "in", language);

  // Keep all AI calls on server so model/key config is centralized in Cloud Run.
  if (USE_SERVER_AI_ONLY || !GEMINI_KEY) {
    try {
      const parsed = await generateTravelPlanViaServer(prompt, history, language);
      try {
        await setDoc(cacheRef, {
          promptHash,
          plan: parsed,
          createdAt: serverTimestamp()
        });
      } catch (cacheError) {
        console.warn("Failed to save cache:", cacheError);
      }
      return parsed;
    } catch (error: any) {
      console.error("Server-side generation failed:", error);
      const message = mapServerAiErrorMessage(String(error?.message || ''), language);
      throw new Error(message);
    }
  }

  try {
    const contextPrompt = history.length > 0 
      ? `Conversation history:
         ${history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n')}
         
         New request: "${prompt}"`
      : `Request: "${prompt}"`;

    // Language mapping
    const langMap = {
      'en': 'ENGLISH',
      'ja': 'JAPANESE (日本語)',
      'vi': 'VIETNAMESE (Tiếng Việt)'
    };
    const targetLang = langMap[language];

    const chat = ai.chats.create({
      model: DIRECT_GEMINI_MODEL,
      config: {
        systemInstruction: `You are a Japan travel expert.
        
        STRICT RULES:
        1. LANGUAGE: You MUST respond in the EXACT language requested. 
           - Current Target Language: ${targetLang}
           - If Target is Japanese, NEVER use Vietnamese or English for content.
           - If Target is Vietnamese, NEVER use Japanese or English for content.
           - If Target is English, NEVER use Japanese or Vietnamese for content.
        
        2. GOOGLE MAPS LINKS:
           - For EVERY location, parking, or restaurant, you MUST include a link: [Name](https://www.google.com/maps/search/?api=1&query={Name})
           - This is MANDATORY for the "summary" field.
        
        3. RESPONSE STYLE (CRITICAL):
           - LIST LINE BY LINE: Always present information in bullet points.
           - OPTIMIZE SPEED: Answer extremely concisely, go straight to the point.
           - FOCUS: Absolutely no long introductory or concluding paragraphs.
           - STRUCTURE: Each location or important information must be on a separate line.
           - Use a clean, structured, and easy-to-read format like a professional travel guide.
           - Use emojis to make it visually appealing (e.g., 🚗, 🏯, 🌸, 👉).
           - Use bold text for key information (e.g., **Address**, **Price**).
           - Start with a clear "Answer:" or direct answer.
           - The 'summary' field MUST: Be 100% in bullet points, max 5-7 lines.
        
        4. RESPONSE TYPE:
           - Use "type": "chat" for general questions, recommendations, or specific lookups (e.g., "kimono shops in Osaka", "parking in Nagoya").
           - Use "type": "plan" ONLY when the user explicitly asks for a multi-day itinerary or a structured travel plan.
           - If "type" is "chat":
             - The "days" array MUST be empty.
             - The "itinerarySummary" array MUST be empty.
             - Focus ALL relevant information, details, and Google Maps links in the "summary" field.
        
        5. REAL-TIME EVENTS:
           - Use Google Search grounding to find the MOST RECENT events, festivals, and happenings in Japan for the current date: ${new Date().toLocaleDateString()}.
           - Ensure event dates and details are accurate and up-to-date.
        
        6. FORMAT: Return ONLY JSON.`,
        responseMimeType: "application/json",
        tools: [{ googleSearch: {} }],
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["plan", "chat"] },
            destination: { type: Type.STRING },
            summary: { 
              type: Type.STRING, 
              description: "Response in " + targetLang + ". MUST be highly structured with emojis and Google Maps links." 
            },
            itinerarySummary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING },
                  area: { type: Type.STRING },
                  focus: { type: Type.STRING }
                },
                required: ["day", "area", "focus"]
              }
            },
            days: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  day: { type: Type.STRING },
                  title: { type: Type.STRING },
                  activities: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        time: { type: Type.STRING },
                        activity: { type: Type.STRING },
                        location: { type: Type.STRING },
                        description: { type: Type.STRING },
                        googleMapsUrl: { type: Type.STRING }
                      },
                      required: ["time", "activity", "location", "description"]
                    }
                  }
                },
                required: ["day", "title", "activities"]
              }
            },
            tips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            hotels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  area: { type: Type.STRING },
                  priceRange: { type: Type.STRING },
                  description: { type: Type.STRING },
                  bookingUrl: { type: Type.STRING }
                },
                required: ["name", "area", "priceRange", "description"]
              }
            },
            tickets: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  price: { type: Type.STRING },
                  bookingPoint: { type: Type.STRING },
                  note: { type: Type.STRING }
                },
                required: ["name", "price", "bookingPoint", "note"]
              }
            },
            transportation: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  provider: { type: Type.STRING },
                  price: { type: Type.STRING },
                  details: { type: Type.STRING }
                },
                required: ["type", "provider", "price", "details"]
              }
            },
            events: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  date: { type: Type.STRING },
                  location: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: { type: Type.STRING }
                },
                required: ["name", "date", "location", "description", "type"]
              }
            },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING, description: "Short title" },
                  description: { type: Type.STRING, description: "Brief description of why this is interesting." },
                  query: { type: Type.STRING, description: "The AI query to trigger this exploration." },
                  icon: { type: Type.STRING, description: "A single relevant emoji." }
                },
                required: ["title", "description", "query", "icon"]
              },
              description: "3-5 diverse travel suggestions for the same destination or region."
            }
          },
          required: ["destination", "summary", "tips", "suggestions"]
        }
      },
      history: history.map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }))
    });

    const responseStream = await chat.sendMessageStream({
      message: `USER REQUEST: "${prompt}"
      
      CRITICAL INSTRUCTIONS:
      1. YOU MUST RESPOND IN: ${targetLang}
      2. YOU MUST INCLUDE GOOGLE MAPS LINKS FOR ALL PLACES IN THE SUMMARY.
      3. USE GOOGLE SEARCH TO FIND REAL-TIME EVENTS OR SPECIFIC LOCATIONS FOR ${new Date().toLocaleDateString()}.
      4. PROVIDE 3-5 DIVERSE EXPLORATION SUGGESTIONS IN 'suggestions'.
      5. YOUR ENTIRE RESPONSE MUST BE A SINGLE VALID JSON OBJECT.
      6. BE CONCISE. GO STRAIGHT TO THE ANSWER.`
    });

    let fullText = "";
    let retryCount = 0;
    const maxRetries = 2;

    const processStream = async (stream: any): Promise<string> => {
      let text = "";
      for await (const chunk of stream) {
        const chunkText = chunk.text;
        text += chunkText;
        if (onChunk) {
          onChunk(text);
        }
      }
      return text;
    };

    fullText = await processStream(responseStream);

    while (retryCount < maxRetries) {
      try {
        if (!fullText) throw new Error("Empty response");
        const parsed = JSON.parse(fullText);
        
        // Save to Cache
        try {
          await setDoc(cacheRef, {
            promptHash,
            plan: parsed,
            createdAt: serverTimestamp()
          });
        } catch (cacheError) {
          console.warn("Failed to save cache:", cacheError);
        }

        return parsed as TravelPlan;
      } catch (e) {
        retryCount++;
        console.warn(`Parsing attempt ${retryCount} failed. Retrying...`, e);
        if (retryCount >= maxRetries) break;
        
        const retryMsg = language === 'ja' ? "JSON形式エラー。有効なJSONとして全データを再送してください。" :
                        language === 'en' ? "JSON format error. Please resend all data as a valid JSON object." :
                        "Lỗi định dạng JSON. Vui lòng gửi lại toàn bộ dữ liệu dưới dạng JSON hợp lệ.";

        const retryStream = await chat.sendMessageStream({
          message: retryMsg
        });
        fullText = await processStream(retryStream);
      }
    }

    const finalError = language === 'ja' ? "AIからのデータ形式エラーが続きました。「再生成」をお試しください。" :
                      language === 'en' ? "Data format error from AI after several attempts. Please try 'Regenerate'." :
                      "Lỗi định dạng dữ liệu từ AI sau nhiều lần thử. Vui lòng nhấn nút 'Tạo lại'.";

    throw new Error(finalError);
  } catch (error: any) {
    console.error("Error generating travel plan:", error);
    // Ensure we propagate the specific error message if it exists
    const message = error.message || (language === 'ja' ? "AI接続エラー。ネットワークを確認してください。" : 
                                      language === 'en' ? "AI connection error. Please check your network." :
                                      "Lỗi kết nối AI. Vui lòng kiểm tra mạng và thử lại.");
    throw new Error(message);
  }
};


export const getPlaceInfo = async (placeName: string, language: 'en' | 'ja' | 'vi' = 'vi') => {
  if (USE_SERVER_AI_ONLY || !GEMINI_KEY) {
    return await getPlaceInfoViaServer(placeName, language);
  }

  const langPrompt = language === 'ja' ? "日本語で説明してください。" :
                     language === 'en' ? "Please explain in English." :
                     "Trình bày bằng tiếng Việt.";

  try {
    const response = await ai.models.generateContent({
      model: DIRECT_GEMINI_MODEL,
      contents: `Detailed information about: ${placeName}. Include history, highlights, and how to get there. ${langPrompt} Concise, Markdown format.`,
    });

    return {
      text: response.text || "No information.",
      grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error: any) {
    console.error("Error getting place info:", error);
    const errorMsg = language === 'ja' ? "情報を取得できませんでした。" :
                     language === 'en' ? "Could not get information." :
                     "Không thể lấy thông tin địa điểm lúc này.";
    return { text: errorMsg, grounding: [] };
  }
};
