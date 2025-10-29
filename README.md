# HarmonicOS

## Team & Contributions
- **Soham Vohra**: Built the playlist creation system, Spotify API integration, and front-end components.
-  Built the UI styling and modal interactions.
-  Worked on backend setup and API routing.

## What It Does
HarmonicOS is a music playlist builder that lets users browse tracks, add them to a “playlist cart,” and create custom Spotify playlists directly from the web app. The frontend handles Spotify authentication and playlist creation through the Spotify API, while the backend supports additional data handling and mock endpoints.

## Setup
### Frontend
```bash
npm install
npm run dev
```

### Backend
Inside the `music_playlist/backend` directory:
```bash
python3 -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

The frontend runs on Vite (React), and the backend runs on FastAPI with Uvicorn. You can engage with the app at https://localhost:5173

## Data
This app is fully connected to the Spotify Web API. Authentication is handled using Spotify's authentication + JWT
token return functionality, with properly setting up Redirect URI through Spotify's app dashboard. Client secret and
key are stored in .env file (which should be in /backend folder), and served to the front end to handle auth.
