# How to Use Element Tracker CDN

## 🚀 Quick Start (2 Steps)

### Step 1: Include the CDN File
```html
<script src="./element-tracker-cdn.js"></script>
```

### Step 2: Enable Tracking
```html
<script>
setTimeout(() => {
    ElementTracker.enableElementTracking();
}, 100);
</script>
```

## 📋 Complete Example

Copy this code to any HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Project</title>
</head>
<body>
    <h1>My Website</h1>
    <button>Click Me</button>
    <p>Click this paragraph</p>
    
    <!-- Step 1: Include CDN -->
    <script src="./element-tracker-cdn.js"></script>
    
    <!-- Step 2: Enable tracking -->
    <script>
        setTimeout(function() {
            if (ElementTracker) {
                ElementTracker.enableElementTracking();
                console.log('✅ Element tracking ready!');
            }
        }, 100);
    </script>
</body>
</html>
```

## 🌐 Hosting Options

### Option A: Upload to Your Server
1. Upload `element-tracker-cdn.js` to your website
2. Reference it: `<script src="https://yoursite.com/js/element-tracker-cdn.js"></script>`

### Option B: Copy to Each Project
1. Copy `element-tracker-cdn.js` to your project folder
2. Reference it: `<script src="./element-tracker-cdn.js"></script>`

### Option C: Use with Static Hosts
- **Netlify**: Drag & drop folder → Get instant CDN
- **Vercel**: Deploy folder → Get global CDN  
- **GitHub Pages**: Upload to repo → Get CDN link

## 🎯 What You Get

- **Blue outline** appears on clicked elements
- **Only last clicked** element stays focused
- **Works on all elements**: buttons, divs, paragraphs, etc.
- **WebSocket support** for sending click data to server

## 📱 API Methods

```javascript
// Enable tracking (shows blue outline)
ElementTracker.enableElementTracking();

// Disable tracking
ElementTracker.disableElementTracking();

// Connect to WebSocket server (optional)
ElementTracker.connect('ws://localhost:5203/');

// Check status
console.log('Connected:', ElementTracker.isConnected);
console.log('Tracking:', ElementTracker.isTrackingEnabled);
```

## 🧪 Test Your Setup

1. Open `test-example.html` in browser
2. Should see green "✅ Element tracking enabled!"
3. Click any element → Should see blue outline
4. If red error → CDN file not found

## ❓ Troubleshooting

**Problem**: "ElementTracker is not defined"
**Solution**: Make sure `element-tracker-cdn.js` is in same folder

**Problem**: No blue outline appears
**Solution**: Check browser console for errors

**Problem**: Works locally but not on server
**Solution**: Check file path and server permissions

## 🎨 Customization

Change the blue outline color by editing the CDN file:
```javascript
// Find this line in element-tracker-cdn.js:
element.style.outline = '2px solid #007bff';

// Change to your color:
element.style.outline = '2px solid red';
``` 