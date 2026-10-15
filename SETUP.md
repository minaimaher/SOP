# Deployment and configuration record

How the live SOP Builder is set up, so it can be checked or rebuilt later. The app itself is described in [README.md](README.md).

## Website (GitHub Pages)

| Setting | Value |
|---|---|
| Repository | `minaimaher/SOP` (public) |
| Pages source | Deploy from a branch |
| Branch / folder | `claude/gracious-allen-0jizkl` / `/ (root)` |
| Address | https://minaimaher.github.io/SOP/ |
| Settings page | https://github.com/minaimaher/SOP/settings/pages |

`.nojekyll` in the repository root makes GitHub serve the files exactly as they are.

## Firebase project

| Setting | Value |
|---|---|
| Project ID | `sopbuilder-b3475` |
| Console | https://console.firebase.google.com/project/sopbuilder-b3475 |
| Auth domain | `sopbuilder-b3475.firebaseapp.com` |
| Web app config | [`js/firebase-config.js`](js/firebase-config.js) |

The web app config only identifies the project; it is not a secret. Access to data is controlled by the Firestore rules below.

### Console settings to keep in place

| Where in the console | Setting |
|---|---|
| Authentication → Sign-in method | **Email/Password** on; **Google** on if wanted |
| Authentication → Settings → Authorized domains | `minaimaher.github.io` (plus `localhost` and the Firebase defaults) |
| Firestore Database | Created in production mode |
| Firestore Database → Rules | Contents of [`firestore.rules`](firestore.rules), published |

### Firestore rules

Each signed-in user can read and write only their own data:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

If the rules are changed in the console, update `firestore.rules` in this repository to match.

### Where data is stored

| Path | Contents |
|---|---|
| `users/{uid}/manuals/{manualId}` | Manual name, last saved time, number of chunks |
| `users/{uid}/manuals/{manualId}/chunks/{n}` | The manual itself, as JSON text split into chunks of up to 300,000 characters (Firestore limits each document to 1 MB) |
| `users/{uid}/manuals/{manualId}/versions/{versionId}` (+ `/chunks/{n}`) | Saved versions; the newest 50 are kept |
| `users/{uid}/templates/{templateId}` (+ `/chunks/{n}`) | Saved templates |
| `users/{uid}/meta/prefs` | Default settings for new manuals and the last opened manual |

Signed-out visitors' work is saved only in their own browser (IndexedDB database `sop-builder`).

## Checklist after changing anything

1. Open https://minaimaher.github.io/SOP/ and press Ctrl+F5 (Cmd+Shift+R on Mac).
2. Sign in, edit something, and check that the status above the preview says **Saved to your account**.
3. In Firebase, **Firestore Database → Data** shows the edit under `users`.
