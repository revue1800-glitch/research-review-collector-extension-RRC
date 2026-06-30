# Research Review Collector

A Chrome extension that helps researchers organise literature reviews by automatically extracting metadata from research articles and recording structured review notes and replication assessments.

---

## Features

- Automatically extracts metadata from the current research article, including:
  - Page title
  - URL
  - Author(s)
  - Publication date
  - Journal
  - DOI
- Allows users to:
  - Create a username
  - Record review comments
  - Indicate whether they were able to replicate the experimental work
- Saves reviews securely to Firebase Firestore
- View previously saved reviews

---

## Technologies

- JavaScript (ES6)
- HTML5
- CSS3
- Chrome Extensions (Manifest V3)
- Firebase Authentication
- Cloud Firestore
- Vite

---

## Screenshots

### Main popup

see screenshots folder

---

## Installation

```bash
npm install
npm run build
```

Load the generated `dist` folder as an unpacked extension in Google Chrome.

---

## Future Improvements

- PDF metadata extraction
- Advanced search and filtering of saved reviews
- Export reviews to CSV
- Synchronisation across multiple devices

---

## About

This project was developed to streamline the process of reviewing academic literature by combining automatic metadata extraction with structured note-taking and cloud-based storage. It demonstrates experience with JavaScript, Chrome Extension development, Firebase services, and modern web application design.