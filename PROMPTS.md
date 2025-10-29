# AI Prompts Used

## Round 1: Initial Structure
**Prompt:**  
"I’ve already initialized a React + FastAPI project using Vite for the frontend and FastAPI for the backend. I’ve installed the basic dependencies and created the folders. Can you help me refine the structure so it’s clean and easy to expand for Spotify playlist creation? The functionality I want to provide is searching for songs via 'vibe', 'genre', 'artist', or 'era', and ability to add playlists into a cart with the ability to export them to Spotify as playlists."

**Result:**  
- The assistant reviewed the existing setup and suggested a refined folder hierarchy with proper separation between `/src` (frontend) and `/backend` (FastAPI server).  
- We discussed Figma wireframes to visualize the modal and cart layout, focusing on matching the HarmonicOS theme.  
- The result was a clear, production-ready foundation with working `App.jsx`, `App.css`, and a basic backend scaffold.

**What Worked Immediately:**  
- Clean file structure and modular component breakdown.  
- Minimal configuration thanks to Vite and FastAPI’s simplicity.  

**What Needed Fixing:**  
- Some missing connection points between frontend and backend endpoints.  
- Needed more polished UI alignment and consistent CSS themes.

**What We Learned:**  
- Building a base manually first makes it easier to debug setup issues later.  
- Using FastAPI’s CORS middleware is crucial when connecting local frontend and backend servers.

---

## Round 2: Feature Implementation
**Prompt:**  
"I want to add a circular cart button in the top right corner of the app that stays fixed on scroll. When clicked, it opens a modal showing the tracks added to the playlist cart."

**Result:**  
- Added a `CartButton` component with hover dimming, drop shadows, and fixed positioning.  
- Implemented a modal with track cards rendered dynamically from React state.  
- Styled modal overlay and transitions for a premium glassy aesthetic.

**What Worked Immediately:**  
- CSS positioning, transitions, and shadow effects.  
- Clean modal toggling using React state.

**What Needed Fixing:**  
- Modal initially rendered inline instead of overlaying content.  
- Some CSS shadows appeared too strong and needed balancing.

**What We Learned:**  
- Keeping modals at the root of the component tree prevents layout conflicts.  
- Subtle shadow adjustments dramatically affect perceived polish.

---

## Round 3: Spotify Integration
**Prompt:**  
"I want users to authenticate with Spotify so they can save playlists to their accounts. I’m not sure what the best way to handle this is — what’s the right authentication method for a React + FastAPI setup?"

**Result:**  
- The assistant explained Spotify’s current authentication standards, outlining the differences between implicit grant and Authorization Code with PKCE.  
- After learning that implicit grant was deprecated for new apps, we decided to implement PKCE for better security and user experience.  
- Implemented full PKCE flow with `code_verifier` and `code_challenge` helpers in `App.jsx`, including automatic redirect handling and token exchange.  
- Successfully connected the app to Spotify, allowing playlist creation through the authenticated user account.

**What Worked Immediately:**  
- The PKCE challenge generator and token exchange flow.  
- Dynamic playlist creation using Spotify’s `/v1/me` and `/v1/playlists` endpoints.

**What Needed Fixing:**  
- Redirect URI mismatch between Spotify dashboard and local server.  
- Needed to explicitly run the Vite dev server on `127.0.0.1` to match Spotify’s redirect URI.

**What We Learned:**  
- Spotify no longer supports implicit grants (`response_type=token`) for new apps.  
- PKCE (Proof Key for Code Exchange) is the secure, modern standard for SPA authorization flows.  
- Understanding the OAuth flow visually (via diagrams or logs) helps demystify complex authentication processes.

---

## Round 4: Backend Integration & Security
**Prompt:**  
"Can we stop hardcoding the Spotify client ID in the frontend and expose it safely from the backend API instead?"

**Result:**  
- Added a FastAPI route `/api/spotify-client-id` to return only the client ID, never the secret.  
- Updated `App.jsx` to fetch the client ID dynamically on startup via `fetch()`.  
- Maintained a secure separation of frontend and backend credentials.

**What Worked Immediately:**  
- FastAPI route and CORS setup for cross-origin access.  
- Dynamic fetching logic with React state and guards to ensure ID availability before authentication.

**What Needed Fixing:**  
- Timing issues where Spotify auth could trigger before the client ID loaded. Added a safety check and alert to handle that gracefully.

**What We Learned:**  
- Never expose secrets or client credentials in client code.  
- Use a backend API proxy for dynamic environment-based config.

---

## Best Practices Discovered
- Keep prompts focused on one deliverable at a time (e.g., styling, backend auth, or README).  
- Use screenshots or Figma references early to ensure UI alignment before coding.  
- Always validate redirect URIs and server origins before Spotify auth testing.  
- Maintain a `.env` for backend credentials and expose only what the frontend needs.  
- Save prompt iterations — they show how design thinking evolves across development.
