# SafeHer AI — Setup & Deployment Guide
## For Solo Founders · Beginner-Friendly

---

## 📁 Files You Received

```
safeher-ai/
├── index.html      ← Main app (all pages)
├── style.css       ← All styling
├── app.js          ← All logic
├── sw.js           ← Service Worker (PWA/offline)
├── manifest.json   ← PWA install config
└── SETUP_GUIDE.md  ← This file
```

---

## STEP 1 — Set Up Firebase (Free)

Firebase is your backend — handles login, database, and file storage.

### 1.1 Create a Firebase Project
1. Go to https://console.firebase.google.com
2. Click **"Add project"** → name it `safeher-ai` → Continue
3. Disable Google Analytics (optional for MVP) → **Create project**

### 1.2 Enable Authentication
1. In left sidebar → **Build → Authentication**
2. Click **"Get started"**
3. Click **"Email/Password"** → Enable it → Save

### 1.3 Create Firestore Database
1. In left sidebar → **Build → Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (for MVP — you'll lock this down later)
4. Select a region → Done

### 1.4 Enable Storage
1. In left sidebar → **Build → Storage**
2. Click **"Get started"** → Start in test mode → Done

### 1.5 Get Your Firebase Config
1. In left sidebar → ⚙️ **Project Settings** → **General**
2. Scroll to "Your apps" → Click the **</>** (Web) icon
3. Register app name `safeher-ai` → Continue
4. Copy the `firebaseConfig` object shown

### 1.6 Paste Config in index.html
Open `index.html` and find this section (around line 25):

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  ...
};
```

Replace with your real values. Save the file.

### 1.7 Create Firestore Collections (auto-created on first use)
These collections are created automatically when users first interact:
- `users` — user profiles
- `emergency_contacts` — trusted contacts per user
- `safety_reports` — community-reported unsafe areas
- `community_posts` — community safety network posts
- `alerts` — SOS triggers & AI detection logs

### 1.8 Add Firestore Security Rules (Important!)
In Firebase Console → Firestore → Rules, replace with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /emergency_contacts/{doc} {
      allow read, write: if request.auth != null && 
        (resource == null || resource.data.uid == request.auth.uid);
    }
    match /safety_reports/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /community_posts/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /alerts/{doc} {
      allow read: if request.auth != null && resource.data.uid == request.auth.uid;
      allow write: if request.auth != null;
    }
  }
}
```

---

## STEP 2 — Set Up Google Maps API (Free tier available)

### 2.1 Get an API Key
1. Go to https://console.cloud.google.com
2. Create a new project or select existing
3. Go to **APIs & Services → Library**
4. Search and enable:
   - **Maps JavaScript API**
   - **Places API**
   - **Directions API**
   - **Geocoding API**
5. Go to **APIs & Services → Credentials**
6. Click **"Create Credentials" → API Key**
7. Copy the key

### 2.2 Paste Key in index.html
Find this line near the bottom of `index.html`:

```html
<script async defer
  src="https://maps.googleapis.com/maps/api/js?key=YOUR_MAPS_API_KEY&...">
```

Replace `YOUR_MAPS_API_KEY` with your key.

### 2.3 Restrict the Key (Important for security)
In Google Cloud Console → Your API Key → Edit:
- Under **Application restrictions** → select **HTTP referrers**
- Add your domain: `https://yourusername.github.io/*`
- Under **API restrictions** → Restrict to the 4 APIs above

---

## STEP 3 — Set Up OpenAI API (AI Harassment Detection)

### 3.1 Get an API Key
1. Go to https://platform.openai.com
2. Sign up / Log in
3. Go to **API Keys** → **Create new secret key**
4. Copy the key (starts with `sk-`)

### 3.2 How Users Enter the Key
- In the app, users go to **AI Check** page
- They paste their OpenAI key in the field provided
- The key is stored **only in their browser** (localStorage)
- It is never sent to your servers

> **Note for MVP:** The app includes a local keyword-based fallback classifier
> that works WITHOUT an OpenAI key. This handles basic cases.
> For production, consider proxying API calls through a Firebase Cloud Function
> so you don't expose keys in the browser.

---

## STEP 4 — Deploy to GitHub Pages (Free)

### 4.1 Create a GitHub Account
Go to https://github.com and sign up (free).

### 4.2 Create a New Repository
1. Click the **+** icon → **New repository**
2. Name it `safeher-ai`
3. Set to **Public** (required for free GitHub Pages)
4. Click **Create repository**

### 4.3 Upload Your Files
**Option A — Upload via browser (easiest for beginners):**
1. In your new repo, click **"uploading an existing file"**
2. Drag and drop all 5 files: `index.html`, `style.css`, `app.js`, `sw.js`, `manifest.json`
3. Click **"Commit changes"**

**Option B — Using Git (if you have it installed):**
```bash
git init
git add .
git commit -m "SafeHer AI MVP launch"
git remote add origin https://github.com/yourusername/safeher-ai.git
git push -u origin main
```

### 4.4 Enable GitHub Pages
1. In your repo → **Settings** tab
2. Scroll to **Pages** in the left sidebar
3. Under **Source** → Select **"Deploy from a branch"**
4. Branch: **main** · Folder: **/ (root)**
5. Click **Save**

### 4.5 Your App is Live!
After 1-2 minutes, your app will be at:
```
https://yourusername.github.io/safeher-ai/
```

---

## STEP 5 — Add PWA Icons (Optional but recommended)

Create an `icons/` folder and add:
- `icon-192.png` (192×192 pixels)
- `icon-512.png` (512×512 pixels)

Use your SafeHer AI logo or a shield icon.
Free tool: https://realfavicongenerator.net

---

## STEP 6 — Custom Domain (Optional)

To use `www.safeherai.com` instead of github.io:
1. Buy domain at Namecheap, GoDaddy, etc.
2. In GitHub Pages settings → enter your custom domain
3. In your domain registrar → add a CNAME record pointing to `yourusername.github.io`

---

## 🔒 Security Checklist Before Launch

- [ ] Firestore security rules are set (Step 1.8)
- [ ] Google Maps API key is restricted to your domain
- [ ] OpenAI calls go through Firebase Cloud Functions (not browser) in production
- [ ] Firebase Authentication is enabled
- [ ] Test SOS flow with a friend before launch
- [ ] Add real emergency numbers for your country/region

---

## 📱 Converting to Mobile App Later

When you're ready to publish to app stores:

**For Android:**
- Use **PWABuilder** (https://pwabuilder.com) → Import your URL → Download APK
- Or wrap in **Capacitor**: `npm install @capacitor/core @capacitor/android`

**For iOS:**
- Use **PWABuilder** for iOS package
- Or wrap in **Capacitor**: `npm install @capacitor/ios`

---

## 🆘 Need Help?

Common issues:
- **Map not showing** → Check API key and ensure Maps JavaScript API is enabled
- **Login not working** → Check Firebase config values are correct
- **"Permission denied" error** → Update Firestore security rules
- **App not loading** → Open browser DevTools (F12) → Console tab to see errors

---

*Built with ❤️ for women's safety. SafeHer AI v1.0.0 MVP*
