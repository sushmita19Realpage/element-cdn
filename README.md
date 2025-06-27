# Element Tracker CDN - Standalone

A lightweight JavaScript library for tracking element interactions with visual focus indicators.

## 🚀 Quick Usage

### Option 1: Direct CDN (Upload to any server)
Upload `element-tracker-cdn.js` to your server and use:

```html
<script src="https://your-domain.com/path/element-tracker-cdn.js"></script>
<script>
    ElementTracker.enableElementTracking();
</script>
```

### Option 2: Local File (Copy to project)
Copy `element-tracker-cdn.js` to your project and use:

```html
<script src="./element-tracker-cdn.js"></script>
<script>
    ElementTracker.enableElementTracking();
</script>
```

## 📖 Complete Example

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
    
    <!-- Include Element Tracker -->
    <script src="./element-tracker-cdn.js"></script>
    <script>
        setTimeout(function() {
            if (ElementTracker) {
                // Enable blue outline on clicked elements
                ElementTracker.enableElementTracking();
                console.log('✅ Element tracking enabled!');
                
                // Optional: Connect to WebSocket server
                ElementTracker.connect('ws://localhost:5203/');
            }
        }, 100);
    </script>
</body>
</html>
```

## 🎯 Features

- **Visual Focus**: Blue outline on clicked elements
- **Smart Focus Management**: Only last clicked element stays focused
- **WebSocket Integration**: Send click data to server
- **Universal Compatibility**: Works with all HTML elements
- **Zero Dependencies**: Pure JavaScript

## 📚 API Methods

- `ElementTracker.enableElementTracking()` - Enable click tracking
- `ElementTracker.disableElementTracking()` - Disable click tracking
- `ElementTracker.connect(url)` - Connect to WebSocket server
- `ElementTracker.disconnect()` - Disconnect from WebSocket
- `ElementTracker.isConnected` - Connection status
- `ElementTracker.isTrackingEnabled` - Tracking status

## 🔗 Hosting Options

### Upload to Any Web Server
1. Upload `element-tracker-cdn.js` to your server
2. Reference it: `<script src="https://yoursite.com/js/element-tracker-cdn.js"></script>`

### Use with Static Site Hosts
- **Netlify**: Drop folder and get instant CDN
- **Vercel**: Deploy and get global CDN
- **GitHub Pages**: Upload to repository
- **Any web hosting**: FTP upload and use

## 💻 Test File

```html
<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body>
    <h1>Test</h1>
    <button>Click me</button>
    <script src="./element-tracker-cdn.js"></script>
    <script>
        setTimeout(() => {
            ElementTracker.enableElementTracking();
            alert('CDN loaded! Click elements to see blue outline.');
        }, 100);
    </script>
</body>
</html>
```

## 📄 License

MIT License - Free to use in any project 