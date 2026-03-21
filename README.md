# JapanAI - olachill.com

Smart travel planning for Japan with AI. Discover destinations, itineraries, and travel tips from Tokyo to Kyoto.

Official deployment: [olachill.com](https://olachill.com)

## Features

- **AI Itinerary Generator**: Create custom 7-day or multi-city plans in seconds.
- **Real-time Search**: Find cafes, restaurants, and second-hand shops (Hard Off, Book Off) across Japan.
- **Train Route Search**: Quick reference for Shinkansen and local train routes.
- **Personalization**: Save your travel style, budget, and interests for tailored recommendations.
- **Multi-language Support**: English, Japanese, and Vietnamese.
- **Dark Mode**: Beautiful editorial design optimized for both light and dark environments.

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS, Framer Motion.
- **Backend**: Firebase (Authentication & Firestore).
- **AI**: Google Gemini API (via `@google/genai`).
- **Icons**: Lucide React.

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase Project
- Google Gemini API Key

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/japan-ai.git
   cd japan-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file based on `.env.example` and add your keys.

4. Run development server:
   ```bash
   npm run dev
   ```

## Deployment

This project is configured for easy deployment to **Vercel** or **Firebase Hosting**.

### Vercel
Simply connect your GitHub repository to Vercel. The `vercel.json` file handles SPA routing automatically.

### Firebase
```bash
npm run build
firebase deploy
```

## License

MIT License - feel free to use and modify for your own travel projects!
