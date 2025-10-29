import { useState, useEffect } from 'react';
import './App.css';
import shopIcon from './assets/shop.svg';
import addIcon from './assets/add.svg';

// Generate a random string for code_verifier
function generateCodeVerifier(length = 64) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let value = '';
  for (let i = 0; i < length; i++) {
    value += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return value;
}

// SHA256 -> ArrayBuffer
async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

// base64-url-encode ArrayBuffer
function base64UrlEncode(buffer) {
  let bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Given a code_verifier, make code_challenge
async function createCodeChallenge(codeVerifier) {
  const hashed = await sha256(codeVerifier);
  return base64UrlEncode(hashed);
}

const SPOTIFY_REDIRECT_URI = 'http://127.0.0.1:5173/callback';

const SPOTIFY_SCOPES = [
  'playlist-modify-private',
  'playlist-modify-public',
].join(' ');

function App() {
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState('HarmonicOS Playlist');

  // tracks the user has added to their "playlist cart"
  const [cartTracks, setCartTracks] = useState([]);

  // Spotify client ID (fetched from backend)
  const [spotifyClientId, setSpotifyClientId] = useState(null);

  // derived convenience flag: do we have a Spotify access token yet?
  const isSpotifyConnected = !!spotifyToken;

  // dedicated handler for the "Connect with Spotify" button
  const handleConnectSpotify = async () => {
    const token = await ensureSpotifyAuth();
    // if token is null, we just redirected to Spotify for auth
    // if token exists, we're already connected
    if (token) {
      console.log('Already connected to Spotify');
    }
  };

  useEffect(() => {
    // Fetch the Spotify client ID from backend API
    fetch('http://localhost:8000/api/spotify-client-id')
      .then(res => res.json())
      .then(data => {
        if (data.client_id) {
          setSpotifyClientId(data.client_id);
          console.log('Fetched Spotify Client ID:', data.client_id);
        } else {
          console.error('Error fetching client ID:', data.error);
        }
      })
      .catch(err => {
        console.error('Failed to fetch Spotify Client ID:', err);
      });
  }, []);

  useEffect(() => {
    // Example redirect back:
    // http://127.0.0.1:5173/callback?code=ABC123
    // OR maybe user is just on the main page with no code.
    const url = new URL(window.location.href);
    const authCode = url.searchParams.get('code');

    if (!authCode) {
      // no code in URL -> user either hasn't logged in yet OR already has token in state
      return;
    }

    // we DO have an auth code -> exchange it for an access token using PKCE
    const codeVerifier = sessionStorage.getItem('spotify_code_verifier');
    if (!codeVerifier) {
      console.error('Missing code_verifier in sessionStorage, cannot finish PKCE');
      return;
    }

    // Don't proceed until client ID is loaded
    if (!spotifyClientId) {
      console.error('Spotify client ID not loaded yet');
      return;
    }

    // Build the token request body. Spotify expects
    // application/x-www-form-urlencoded
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: spotifyClientId,
      code_verifier: codeVerifier,
    });

    fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
      .then(res => {
        if (!res.ok) {
          console.error('Token exchange failed:', res.status);
        }
        return res.json();
      })
      .then(data => {
        console.log('Spotify token response:', data);
        if (data.access_token) {
          setSpotifyToken(data.access_token);

          // clean up URL (remove ?code=...)
          window.history.replaceState({}, document.title, window.location.pathname);

          // optional: clear verifier since it's one-time use
          sessionStorage.removeItem('spotify_code_verifier');
        } else {
          console.error('No access_token in response:', data);
        }
      })
      .catch(err => {
        console.error('Token exchange error:', err);
      });
  }, [spotifyClientId]);

  const ensureSpotifyAuth = async () => {
    // if we already have a token in state, great
    if (spotifyToken) {
      return spotifyToken;
    }

    // Guard: must have client ID loaded before proceeding
    if (!spotifyClientId) {
      alert('Spotify client ID not loaded yet. Please try again.');
      return null;
    }

    // no token? start PKCE flow:
    // 1. make a code_verifier
    const codeVerifier = generateCodeVerifier();
    sessionStorage.setItem('spotify_code_verifier', codeVerifier);

    // 2. make a code_challenge
    const codeChallenge = await createCodeChallenge(codeVerifier);

    // 3. build the authorize URL using response_type=code and PKCE bits
    const authUrl =
      'https://accounts.spotify.com/authorize' +
      '?response_type=code' +
      '&client_id=' + encodeURIComponent(spotifyClientId) +
      '&redirect_uri=' + encodeURIComponent(SPOTIFY_REDIRECT_URI) +
      '&scope=' + encodeURIComponent(SPOTIFY_SCOPES) +
      '&code_challenge_method=S256' +
      '&code_challenge=' + encodeURIComponent(codeChallenge) +
      '&show_dialog=true';

    console.log('PKCE auth redirect ->', authUrl);

    // 4. send user to Spotify login/consent.
    window.location = authUrl;
    return null;
  };

  // Create a new playlist in the user's Spotify account from cartTracks
  const handleCreatePlaylist = async () => {
    try {
      const token = await ensureSpotifyAuth();
      if (!token) {
        return;
      }

      if (!cartTracks.length) {
        alert('Your cart is empty. Add some tracks first.');
        return;
      }
      // Convert our staged tracks to URIs Spotify accepts.
      // Prefer t.uri if backend gave it, otherwise build from t.id.
      const trackUris = cartTracks
        .map(t => {
          if (t.uri) return t.uri;
          if (t.id) return `spotify:track:${t.id}`;
          return null;
        })
        .filter(Boolean);

      // 2. Get current user profile -> need user.id
      const meRes = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!meRes.ok) {
        console.error('Failed to fetch current user', meRes.status);
        alert('Spotify auth failed. Please try again.');
        return;
      }

      const meData = await meRes.json();
      const userId = meData.id; // Spotify user ID

      // 3. Create a new playlist for that user
      const createRes = await fetch(
        `https://api.spotify.com/v1/users/${encodeURIComponent(userId)}/playlists`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: playlistName && playlistName.trim() ? playlistName.trim() : 'HarmonicOS Playlist',
            description: 'Generated with HarmonicOS ✦',
            public: false, // set true if you want public playlist
          }),
        }
      );

      if (!createRes.ok) {
        console.error('Failed to create playlist', createRes.status);
        alert("Couldn't create playlist on Spotify.");
        return;
      }

      const playlistData = await createRes.json();
      const playlistId = playlistData.id;

      // 4. Add the selected tracks to the new playlist
      const addRes = await fetch(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/tracks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uris: trackUris,
          }),
        }
      );

      if (!addRes.ok) {
        console.error('Failed to add tracks', addRes.status);
        alert('Playlist created, but adding tracks failed.');
        return;
      }

      // 🎉 success
      alert('Playlist created in your Spotify!');
      // Optional: clear cart and close modal
      // setCartTracks([]);
      // setIsCartOpen(false);

    } catch (err) {
      console.error(err);
      alert('Something went wrong creating the playlist.');
    }
  };

  // add a track to the cart (ignore duplicates by id)
  const handleAddToCart = (track) => {
    setCartTracks(prev => {
      const alreadyIn = prev.some(t => t.id === track.id);
      if (alreadyIn) return prev;
      return [...prev, track];
    });
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearchPerformed(true);

    try {
      const response = await fetch('http://localhost:8000/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const data = await response.json();
      
      // Check if there's an error in the response
      if (data.error) {
        setError(data.error);
        setTracks([]);
      } else {
        console.log('Extracted params:', data.extracted_params);
        setTracks(data.tracks || []);
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure the backend is running on port 8000.');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion);
  };

  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getYear = (releaseDate) => {
    return releaseDate ? releaseDate.split('-')[0] : 'Unknown';
  };

  const openCart = () => {
    setIsCartOpen(true);
  };

  const closeCart = () => {
    setIsCartOpen(false);
  };

  return (
    <div className="app">
      {/* Animated background gradient */}
      <div className="background-gradient"></div>
      
      {/* Floating orbs for visual interest */}
      <div className="orb orb-1"></div>
      <div className="orb orb-2"></div>
      <div className="orb orb-3"></div>

      {/* Floating Cart Button (step 1) */}
      <button
        className="cart-fab"
        aria-label="Open playlist cart"
        onClick={openCart}
        style={{ position: 'fixed' }}
      >
        <div className="cart-icon-wrapper" style={{ position: 'relative' }}>
          <img
            src={shopIcon}
            alt="Playlist cart"
            className="cart-icon-svg"
          />

          {cartTracks.length > 0 && (
            <span className="cart-count-badge">{cartTracks.length}</span>
          )}
        </div>
      </button>

      {isCartOpen && (
        <div
          className="cart-overlay-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={closeCart}
        >
          <div
            className="cart-popup-panel"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header row */}
            <div className="cart-popup-header">
              <div className="cart-popup-left">

                <div style={{ lineHeight: 1.2 }}>
                  <div className="cart-popup-title">Playlist Cart</div>
                  <div className="cart-popup-title-small">
                    {cartTracks.length} {cartTracks.length === 1 ? 'track' : 'tracks'}
                  </div>
                </div>
              </div>

              <button
                className="cart-close-x-btn"
                onClick={closeCart}
                type="button"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Track list */}
            <div className="cart-tracks-scroll">
              {cartTracks.length === 0 ? (
                <div
                  style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.8rem',
                    textAlign: 'center',
                    padding: '24px 0'
                  }}
                >
                  No songs yet. Add tracks with the + buttons.
                </div>
              ) : (
                cartTracks.map((t, i) => (
                  <div key={t.id || i} className="cart-track-card">
                    <div className="cart-track-row">
                      <div className="cart-track-img-wrapper">
                        <img
                          src={t.album?.images?.[0]?.url || 'https://via.placeholder.com/300'}
                          alt={t.name}
                        />
                      </div>

                      <div className="cart-track-text">
                        <div className="cart-track-name">{t.name}</div>
                        <div className="cart-track-artist">
                          {t.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                        </div>

                        <div className="cart-track-meta">
                          <span>{getYear(t.album?.release_date)}</span>
                          <span>{formatDuration(t.duration_ms)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="playlist-name-field">
              <label className="playlist-name-label">
                Playlist Title
              </label>
              <input
                className="playlist-name-input"
                type="text"
                maxLength={100}
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder="My custom vibe mix"
              />
            </div>
            <button
                className="cart-create-btn"
                type="button"
                onClick={() => {
                  handleCreatePlaylist()
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  style={{ width: '16px', height: '16px' }}
                >
                  <line
                    x1="12"
                    y1="5"
                    x2="12"
                    y2="19"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <line
                    x1="5"
                    y1="12"
                    x2="19"
                    y2="12"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Create Playlist</span>
              </button>
          </div>
        </div>
      )}

      <div className="container">
        {/* Header Section */}
        <header className="header">
          <div className="logo-container">
            <div className="logo-glow"></div>
            <h1 className="logo">
              <span className="logo-h">H</span>
              <span className="logo-a">a</span>
              <span className="logo-r">r</span>
              <span className="logo-m">m</span>
              <span className="logo-o">o</span>
              <span className="logo-n">n</span>
              <span className="logo-i">i</span>
              <span className="logo-c">c</span>
              <span className="logo-os">OS</span>
            </h1>
          </div>
          <p className="tagline">Vibe-listening starts here</p>
          <div className="connect-spotify-wrapper">
            <button
              type="button"
              className={`connect-spotify-btn ${isSpotifyConnected ? 'connected' : ''}`}
              onClick={handleConnectSpotify}
            >
              <svg
                className="connect-spotify-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>

              <span className="connect-spotify-text">
                {isSpotifyConnected ? 'Connected to Spotify' : 'Connect with Spotify'}
              </span>
            </button>

            {!isSpotifyConnected && (
              <div className="connect-spotify-hint">
                Sign in so we can save playlists to your account.
              </div>
            )}
            {isSpotifyConnected && (
              <div className="connect-spotify-hint connected-hint">
                You’re linked. You can create playlists now.
              </div>
            )}
          </div>
        </header>

        {/* Search Section */}
        <div className="search-section">
          <form onSubmit={handleSearch} className="search-form">
            <div className="search-wrapper">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Begin your search... Try 'upbeat pop songs' or 'chill indie vibes'"
                className="search-input"
                disabled={loading}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="clear-button"
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
            <button 
              type="submit" 
              className="search-button"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <span>Search</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>
          </form>

          {/* Suggested searches */}
          <div className="suggestions">
            <button onClick={() => handleSuggestionClick('brooklyn hip hop')} className="suggestion-chip">
              🎵 Brooklyn Hip-Hop
            </button>
            <button onClick={() => handleSuggestionClick('hard 80s rock music')} className="suggestion-chip">
              🎸 Hard 80s rock
            </button>
            <button onClick={() => handleSuggestionClick('sad indie songs')} className="suggestion-chip">
              🌙 Sad indie
            </button>
            <button onClick={() => handleSuggestionClick('uplifting pop anthems')} className="suggestion-chip">
              ✨ Uplifting pop
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
            <p className="loading-text">Finding your perfect vibe...</p>
          </div>
        )}

        {/* Results Section */}
        {!loading && tracks.length > 0 && (
          <div className="results-section">
            <div className="results-header">
              <h2>Your Recommendations</h2>
              <span className="results-count">{tracks.length} tracks found</span>
            </div>
            
            <div className="tracks-grid">
              {tracks.map((track, index) => (
                <div key={track.id || index} className="track-card">
                  {/* Add to playlist / cart button */}
                  <button
                    className="add-to-cart-btn"
                    type="button"
                    aria-label="Add to playlist cart"
                    onClick={() => handleAddToCart(track)}
                  >
                    <img
                      src={addIcon}
                      alt="Playlist add"
                      className="cart-icon-svg"
                    />
                  </button>

                  <div className="track-image-wrapper">
                    <img 
                      src={track.album?.images?.[0]?.url || 'https://via.placeholder.com/300'} 
                      alt={track.name}
                      className="track-image"
                    />
                    <div className="track-overlay">
                      <a
                        href={track.external_urls?.spotify}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="play-button"
                        aria-label="Play on Spotify"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                      </a>
                    </div>
                  </div>
                  
                  <div className="track-info">
                    <h3 className="track-name">{track.name}</h3>
                    <p className="track-artist">
                      {track.artists?.map(a => a.name).join(', ') || 'Unknown Artist'}
                    </p>
                    <div className="track-meta">
                      <span className="track-year">{getYear(track.album?.release_date)}</span>
                      <span className="track-duration">
                        {formatDuration(track.duration_ms)}
                      </span>
                    </div>
                  </div>

                  <a 
                    href={track.external_urls?.spotify} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="spotify-link"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                    </svg>
                    Open in Spotify
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && searchPerformed && tracks.length === 0 && !error && (
          <div className="empty-state">
            <div className="empty-icon">🎵</div>
            <h3>No tracks found</h3>
            <p>Try adjusting your search or explore our suggestions above</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by Spotify API & Deepseek AI</p>
      </footer>
    </div>
  );
}

export default App;