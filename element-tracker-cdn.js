/**
 * Element Tracker CDN Library
 * Combines WebSocket service and element clicking functionality
 * Compatible with AMD, CommonJS, and global window
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.ElementTracker = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // WebSocket Service Class
    function WebSocketService() {
        this.socket = null;
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.onElementClickCallbacks = [];
        this.onInstructionCallbacks = [];
        this.injectedContents = new Map();
        this.isDynaDubbing = true;

        // Set up the message event listener for debugging mode
        var self = this;
        if (typeof window !== 'undefined') {
            window.addEventListener('message', function(event) {
                console.log("Received message:", event.data);
                if (event.data && event.data.type === 'SET_DEBUGGING') {
                    console.log('Dyna dubbing set to', event.data.value);
                    self.isDynaDubbing = !!event.data.value; // Convert to boolean
                }
            });
        }
    }

    WebSocketService.prototype.connect = function(adminDashboardUrl) {
        adminDashboardUrl = adminDashboardUrl || 'http://localhost:5203/';
        var self = this;



        // Don't attempt to connect if already connecting or max attempts reached
        if (this.isConnecting) {
            console.warn('Connection attempt already in progress');
            return;
        }

        if (this.connectionAttempts >= this.maxConnectionAttempts) {
            console.error('Maximum connection attempts (' + this.maxConnectionAttempts + ') reached. Please try again later.');
            return;
        }

        try {
            this.isConnecting = true;
            this.connectionAttempts++;
            console.log('Connection attempt ' + this.connectionAttempts + '/' + this.maxConnectionAttempts);

            // Convert HTTP URL to WebSocket URL
            var wsUrl = adminDashboardUrl.replace(/^http/, 'ws');
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = function() {
                console.log('Connected to admin dashboard');
                self.isConnected = true;
                self.isConnecting = false;
                // Reset connection attempts on successful connection
                self.connectionAttempts = 0;
            };

            this.socket.onclose = function(event) {
                console.log('Disconnected from admin dashboard: Code ' + event.code + ' - ' + event.reason);
                self.isConnected = false;
                self.isConnecting = false;
                
                // If not a normal closure and we haven't reached max attempts, try to reconnect
                if (event.code !== 1000 && self.connectionAttempts < self.maxConnectionAttempts) {
                    console.log('Will retry connection in 5 seconds (attempt ' + self.connectionAttempts + '/' + self.maxConnectionAttempts + ')');
                    
                    // Clear any existing timer
                    if (self.reconnectTimer) {
                        clearTimeout(self.reconnectTimer);
                    }
                    
                    // Set a new timer for reconnection
                    self.reconnectTimer = setTimeout(function() {
                        self.connect(adminDashboardUrl);
                    }, 5000); // 5 second delay between reconnection attempts
                }
            };

            this.socket.onerror = function(error) {
                console.error('WebSocket connection error:', error);
                self.isConnected = false;
                // The onclose handler will be called after this, which will handle reconnection
            };

            this.socket.onmessage = function(event) {
                try {
                    var message = JSON.parse(event.data);
                    if (message.type === 'element-clicked') {
                        self.onElementClickCallbacks.forEach(function(cb) {
                            cb(message);
                        });
                    } else if (message.type === 'inject-instruction') {
                        // Handle instruction from admin dashboard
                        var instruction = message.data;
                        console.log('Received instruction:', instruction);

                        // Process the instruction
                        self.handleInstruction(instruction);
                        
                        // Notify callbacks
                        self.onInstructionCallbacks.forEach(function(cb) {
                            cb(instruction);
                        });
                    }
                } catch (err) {
                    console.warn('Received non-JSON message:', event.data);
                }
            };



        } catch (error) {
            console.error('Failed to connect to admin dashboard:', error);
            this.isConnecting = false;
            
            // Try to reconnect if we haven't reached max attempts
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                }
                
                this.reconnectTimer = setTimeout(function() {
                    self.connect(adminDashboardUrl);
                }, 5000);
            }
        }
    };

    // Register a callback for element click events received from the server
    WebSocketService.prototype.onElementClick = function(callback) {
        this.onElementClickCallbacks.push(callback);
    };

    // Register a callback for instruction events received from the server
    WebSocketService.prototype.onInstruction = function(callback) {
        this.onInstructionCallbacks.push(callback);
    };

    // Check if instruction should be applied
    WebSocketService.prototype.shouldApplyInstruction = function(instruction) {
        console.log('🔍 shouldApplyInstruction check:');
        console.log('  - instruction.publish:', instruction.publish);
        console.log('  - this.isDynaDubbing:', this.isDynaDubbing);
        
        var shouldApply = instruction.publish === true || this.isDynaDubbing;
        console.log('  - Final decision:', shouldApply);
        
        // Only apply if publish is true or isDynaDubbing is true
        return shouldApply;
    };

    // Handle instructions received from the admin dashboard
    WebSocketService.prototype.handleInstruction = function(instruction) {
        console.log('🔧 handleInstruction called:', instruction);
        
        if (!this.shouldApplyInstruction(instruction)) {
            console.log('Instruction ignored (not published and not dubbing mode)');
            return;
        }
        
        console.log('✅ Processing instruction:', instruction.action, 'on', instruction.selector);
        
        try {
            switch (instruction.action) {
                case 'appendHTML':
                    console.log('📝 Calling appendHTML...');
                    this.appendHTML(instruction);
                    break;
                case 'replaceHTML':
                    console.log('🔄 Calling replaceHTML...');
                    this.replaceHTML(instruction);
                    break;
                case 'removeElement':
                    console.log('🗑️ Calling removeElement...');
                    this.removeElement(instruction);
                    break;
                default:
                    console.warn('Unknown instruction action:', instruction.action);
            }
            console.log('✅ Instruction processing completed');
        } catch (error) {
            console.error('❌ Error handling instruction:', error);
            console.error('❌ Error details:', error.message);
            console.error('❌ Stack trace:', error.stack);
        }
    };

    // Append HTML content to an element
    WebSocketService.prototype.appendHTML = function(instruction) {
        if (!instruction.selector || !instruction.content) {
            console.error('Invalid append instruction: Missing selector or content');
            return;
        }

        try {
            var element = document.querySelector(instruction.selector);
            if (!element) {
                console.warn('Element not found for selector: ' + instruction.selector);
                return;
            }

            // Save the original content before modification
            var originalContent = element.innerHTML;
            
            // Append the new content
            element.innerHTML += instruction.content;
            
            // Store the injected content for potential reversion
            this.injectedContents.set(instruction.id, {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                content: instruction.content,
                originalContent: originalContent,
                element: element,
                timestamp: instruction.timestamp
            });
            
            console.log('Successfully appended HTML to ' + instruction.selector);
        } catch (error) {
            console.error('Error appending HTML:', error);
        }
    };

    // Replace HTML content of an element
    WebSocketService.prototype.replaceHTML = function(instruction) {
        console.log('🔄 replaceHTML method called with:', instruction);
        console.log('🔄 Selector:', instruction.selector);
        console.log('🔄 New content:', instruction.content);
        
        if (!instruction.selector || !instruction.content) {
            console.error('❌ Invalid replace instruction: Missing selector or content');
            console.log('❌ Selector provided:', !!instruction.selector);
            console.log('❌ Content provided:', !!instruction.content);
            return;
        }

        try {
            console.log('🔍 Looking for element with selector:', instruction.selector);
            var element = document.querySelector(instruction.selector);
            console.log('🔍 Found element:', element);
            console.log('🔍 Element exists:', !!element);
            
            if (!element) {
                console.warn('⚠️ Element not found for selector: ' + instruction.selector);
                console.log('📋 Available elements in DOM:');
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < Math.min(5, allElements.length); i++) {
                    var el = allElements[i];
                    console.log('  - ' + el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : ''));
                }
                return;
            }

            // Save the original content before replacement
            var originalContent = element.innerHTML;
            console.log('📋 Original content:', originalContent.substring(0, 50) + (originalContent.length > 50 ? '...' : ''));
            
            // Replace the content
            console.log('🔄 Replacing content...');
            element.innerHTML = instruction.content;
            
            // Verify replacement
            var newContent = element.innerHTML;
            console.log('📋 New content:', newContent.substring(0, 50) + (newContent.length > 50 ? '...' : ''));
            
            // Store the injected content for potential reversion
            this.injectedContents.set(instruction.id, {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                content: instruction.content,
                originalContent: originalContent,
                element: element,
                timestamp: instruction.timestamp
            });
            console.log('💾 Stored replacement data for potential reversion');
            
            console.log('✅ Successfully replaced HTML in ' + instruction.selector);
        } catch (error) {
            console.error('❌ Error replacing HTML:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
        }
    };

    // Remove an element from the DOM
    WebSocketService.prototype.removeElement = function(instruction) {
        console.log('🗑️ removeElement method called with:', instruction);
        console.log('🗑️ Selector to remove:', instruction.selector);
        
        if (!instruction.selector) {
            console.error('❌ Invalid remove instruction: Missing selector');
            return;
        }

        try {
            console.log('🔍 Looking for element with selector:', instruction.selector);
            var element = document.querySelector(instruction.selector);
            console.log('🔍 Found element:', element);
            console.log('🔍 Element exists:', !!element);
            
            if (element) {
                console.log('🔍 Element details:', {
                    tagName: element.tagName,
                    id: element.id,
                    className: element.className,
                    textContent: element.textContent ? element.textContent.substring(0, 50) : 'no text'
                });
            }
            
            if (!element) {
                console.warn('⚠️ Element not found for selector: ' + instruction.selector);
                console.log('📋 Available elements in DOM:');
                var allElements = document.querySelectorAll('*');
                for (var i = 0; i < Math.min(5, allElements.length); i++) {
                    var el = allElements[i];
                    console.log('  - ' + el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : ''));
                }
                return;
            }

            // Save reference to parent
            var parent = element.parentNode;
            console.log('👪 Parent element:', parent ? parent.tagName : 'no parent');
            
            if (!parent) {
                console.error('❌ Element has no parent node');
                return;
            }
            
            // Store the removed element data for potential reversion
            this.injectedContents.set(instruction.id, {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                originalContent: element.outerHTML,
                element: element,
                timestamp: instruction.timestamp
            });
            console.log('💾 Stored removal data for potential reversion');
            
            // Remove the element
            console.log('🗑️ Removing element from DOM...');
            parent.removeChild(element);
            
            // Verify removal
            var checkElement = document.querySelector(instruction.selector);
            console.log('🔍 Verification - element still exists:', !!checkElement);
            
            if (!checkElement) {
                console.log('✅ Successfully removed element ' + instruction.selector);
            } else {
                console.warn('⚠️ Element appears to still exist after removal');
            }
            
        } catch (error) {
            console.error('❌ Error removing element:', error);
            console.error('❌ Error message:', error.message);
            console.error('❌ Error stack:', error.stack);
        }
    };

    // Get all active injections
    WebSocketService.prototype.getInjections = function() {
        return Array.from(this.injectedContents.values());
    };

    // Send element click data to the server
    WebSocketService.prototype.sendElementClick = function(elementData) {
        if (this.socket && this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'element-clicked',
                data: elementData,
                timestamp: new Date().toISOString()
            }));
        } else {
            console.warn('WebSocket not connected. Cannot send element data.');
        }
    };

    // Reset connection attempts and allow trying again
    WebSocketService.prototype.resetConnectionAttempts = function() {
        this.connectionAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        console.log('Connection attempts reset. You can try connecting again.');
    };

    // Disconnect from the WebSocket server
    WebSocketService.prototype.disconnect = function() {
        if (this.socket) {
            this.socket.close(1000, "Normal closure");
            this.socket = null;
            this.isConnected = false;
        }
        
        // Clear any pending reconnection timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    };

    // Element Clicking Tracker Class
    function ElementClickingTracker() {
        this.enabled = false;
        this.throttledClickHandler = null;
        this.websocketService = null; // Will be set later
    }

    ElementClickingTracker.prototype.enable = function() {
        if (this.enabled) {
            return;
        }

        var self = this;
        this.enabled = true;

        var handleElementClick = function(event) {
            var element = event.target;
            var tagName = element.tagName ? element.tagName.toLowerCase() : '';
            
            console.log('Element clicked:', self.getElementPath(element));
            
            var id = element.id || null;
            var className = element.className || null;
            
            // Skip if clicking on body or document
            if (tagName === 'body' || tagName === 'html') {
                return;
            }
            
            // Highlight the clicked element temporarily
            self.highlightElement(element);
            
            // Send element data
            self.sendElementData(element);
        };

        // Throttle function
        var throttle = function(callback, delay) {
            var lastCall = 0;
            return function() {
                var now = new Date().getTime();
                var args = arguments;
                if (now - lastCall < delay) {
                    return;
                }
                lastCall = now;
                return callback.apply(this, args);
            };
        };

        this.throttledClickHandler = throttle(handleElementClick, 300);

        console.log('Element click tracking enabled');
        document.addEventListener('click', this.throttledClickHandler);
    };

    ElementClickingTracker.prototype.disable = function() {
        if (!this.enabled) {
            return;
        }

        this.enabled = false;

        if (this.throttledClickHandler) {
            document.removeEventListener('click', this.throttledClickHandler);
            this.throttledClickHandler = null;
        }

        console.log('Element click tracking disabled');
    };

    ElementClickingTracker.prototype.getElementPath = function(element) {
        if (!element || element.nodeType !== 1) {
            return '';
        }
        
        var path = [];
        while (element && element.nodeType === 1) {
            var selector = element.nodeName.toLowerCase();
            
            if (element.id) {
                selector += '#' + element.id;
                path.unshift(selector);
                break;
            } else {
                var sibling = element;
                var index = 1;
                
                while (sibling = sibling.previousElementSibling) {
                    if (sibling.nodeName.toLowerCase() === selector) {
                        index++;
                    }
                }
                
                if (index !== 1) {
                    selector += ':nth-of-type(' + index + ')';
                }
            }
            
            path.unshift(selector);
            element = element.parentNode;
        }
        
        return path.join(' > ');
    };

    // Function to highlight a clicked element temporarily
    ElementClickingTracker.prototype.highlightElement = function(element) {
        if (!element || element.nodeType !== 1) {
            return;
        }

        // Store original styles to restore later
        var originalOutline = element.style.outline;
        var originalOutlineOffset = element.style.outlineOffset;
        var originalTransition = element.style.transition;
        
        // Apply highlight styles
        element.style.outline = '2px solid rgba(0, 255, 98, 0.7)';
        element.style.outlineOffset = '2px';
        element.style.transition = 'outline 0.2s ease-in-out';
        
        // Remove highlight after 2 seconds
        setTimeout(function() {
            element.style.outline = originalOutline;
            element.style.outlineOffset = originalOutlineOffset;
            element.style.transition = originalTransition;
        }, 2000);
    };

    ElementClickingTracker.prototype.sendElementData = function(element) {
        console.log('🔍 CDN: sendElementData called with element:', element);
        
        var tagName = element.tagName ? element.tagName.toLowerCase() : '';
        var id = element.id || null;
        var className = element.className || null;
        
        console.log('🔍 CDN: Basic element properties:', {
            tagName: tagName,
            id: id,
            className: className,
            nodeName: element.nodeName,
            nodeType: element.nodeType
        });
        
        // Extract attributes
        var attributes = {};
        if (element.attributes) {
            console.log('🔍 CDN: Element has', element.attributes.length, 'attributes');
            for (var i = 0; i < element.attributes.length; i++) {
                var attr = element.attributes[i];
                if (attr.name !== 'class' && attr.name !== 'id' && attr.name !== 'style') {
                    attributes[attr.name] = attr.value;
                }
            }
        } else {
            console.log('🔍 CDN: Element has no attributes');
        }
        
        var elementData = {
            tagName: tagName,
            id: id,
            className: className,
            text: element.innerText || element.textContent || null,
            href: element.href || null,
            value: element.value || null,
            attributes: attributes,
            location: window.location.pathname,
            timestamp: new Date().toISOString(),
            path: this.getElementPath(element)
        };
        
        console.log('🔍 CDN: Constructed elementData:', elementData);
        console.log('🔍 CDN: About to send via WebSocket, connected:', this.websocketService.isConnected);
        
        this.websocketService.sendElementClick(elementData);
    };

    // Create instances
    var websocketService = new WebSocketService();
    var elementTracker = new ElementClickingTracker();
    
    // Link the websocket service to element tracker
    elementTracker.websocketService = websocketService;

    // Initialize with debug logging
    console.log('🔧 ElementTracker CDN: Initializing...');
    console.log('🌐 Environment check:', {
        hasWindow: typeof window !== 'undefined',
        hasDocument: typeof document !== 'undefined',
        hasWebSocket: typeof WebSocket !== 'undefined'
    });
    
    // Environment compatibility checks
    if (typeof window === 'undefined') {
        console.warn('⚠️ ElementTracker CDN: No window object detected - may not work in non-browser environments');
    }
    
    if (typeof WebSocket === 'undefined') {
        console.warn('⚠️ ElementTracker CDN: No WebSocket support detected - connection features will not work');
    }

    // Public API
    var ElementTrackerAPI = {
        // Main methods
        enableElementTracking: function() {
            elementTracker.enable();
        },
        
        // Alias for backward compatibility
        startTracking: function() {
            elementTracker.enable();
        },
        
        disableElementTracking: function() {
            elementTracker.disable();
        },
        
        // Alias for backward compatibility  
        stopTracking: function() {
            elementTracker.disable();
        },
        
        connect: function(url) {
            websocketService.connect(url);
        },
        
        disconnect: function() {
            websocketService.disconnect();
        },
        
        // WebSocket callback methods
        onElementClick: function(callback) {
            websocketService.onElementClick(callback);
        },
        
        onInstruction: function(callback) {
            websocketService.onInstruction(callback);
        },
        
        // Element data methods
        sendElementClick: function(elementData) {
            websocketService.sendElementClick(elementData);
        },
        
        // Injection management methods
        getInjections: function() {
            return websocketService.getInjections();
        },
        
        // Instruction handling methods (manual execution)
        handleInstruction: function(instruction) {
            return websocketService.handleInstruction(instruction);
        },
        
        shouldApplyInstruction: function(instruction) {
            return websocketService.shouldApplyInstruction(instruction);
        },
        
        appendHTML: function(instruction) {
            return websocketService.appendHTML(instruction);
        },
        
        replaceHTML: function(instruction) {
            return websocketService.replaceHTML(instruction);
        },
        
        removeElement: function(instruction) {
            return websocketService.removeElement(instruction);
        },
        
        // Connection management methods
        resetConnectionAttempts: function() {
            websocketService.resetConnectionAttempts();
        },
        
        // Debug and utility methods
        setDynaDubbing: function(enabled) {
            websocketService.isDynaDubbing = !!enabled;
            console.log('Dyna dubbing set to:', websocketService.isDynaDubbing);
        },
        
        getDynaDubbing: function() {
            return websocketService.isDynaDubbing;
        },
        
        // Debug method to test instruction handling
        testInstruction: function(testInstruction) {
            console.log('🧪 CDN: Testing instruction manually:', testInstruction);
            
            if (!testInstruction) {
                console.error('❌ CDN: testInstruction - no instruction provided');
                return;
            }
            
            // Create a test instruction with defaults if missing
            var instruction = {
                id: testInstruction.id || 'test-' + Date.now(),
                action: testInstruction.action || 'removeElement',
                selector: testInstruction.selector || 'body > *:first-child',
                content: testInstruction.content || '<p>Test content</p>',
                publish: true,
                timestamp: new Date().toISOString()
            };
            
            console.log('🧪 CDN: Normalized test instruction:', instruction);
            
            // Test the instruction handling
            websocketService.handleInstruction(instruction);
        },
        
        // Debug method to simulate WebSocket message
        simulateInstructionMessage: function(instruction) {
            console.log('🧪 CDN: Simulating WebSocket instruction message');
            
            var message = {
                type: 'inject-instruction',
                data: instruction || {
                    id: 'sim-' + Date.now(),
                    action: 'removeElement',
                    selector: 'h1',
                    publish: true,
                    timestamp: new Date().toISOString()
                }
            };
            
            console.log('🧪 CDN: Simulated message:', message);
            
            // Trigger the same flow as WebSocket onmessage
            var event = {
                data: JSON.stringify(message)
            };
            
            // Call the message handler directly
            console.log('🧪 CDN: Processing simulated message...');
            
            try {
                var parsedMessage = JSON.parse(event.data);
                if (parsedMessage.type === 'inject-instruction') {
                    var inst = parsedMessage.data;
                    console.log('🧪 CDN: Calling handleInstruction with:', inst);
                    websocketService.handleInstruction(inst);
                }
            } catch (error) {
                console.error('❌ CDN: Error in simulation:', error);
            }
        },
        
        // Element tracking utility methods
        getElementPath: function(element) {
            return elementTracker.getElementPath(element);
        },
        
        sendElementData: function(element) {
            return elementTracker.sendElementData(element);
        },
        
        highlightElement: function(element) {
            return elementTracker.highlightElement(element);
        },
        
        // Connection state properties
        get isConnected() {
            return websocketService.isConnected;
        },
        
        get isConnecting() {
            return websocketService.isConnecting;
        },
        
        get connectionAttempts() {
            return websocketService.connectionAttempts;
        },
        
        get maxConnectionAttempts() {
            return websocketService.maxConnectionAttempts;
        },
        
        get isTrackingEnabled() {
            return elementTracker.enabled;
        },
        
        // Direct access to services (for advanced usage)
        websocketService: websocketService,
        elementTracker: elementTracker,
        
        // Version info for debugging
        version: '1.0.0',
        buildDate: new Date().toISOString()
    };
    
    // Final initialization logging
    console.log('✅ ElementTracker CDN: Initialized successfully!');
    console.log('📋 Available methods:', Object.keys(ElementTrackerAPI).filter(key => typeof ElementTrackerAPI[key] === 'function'));
    
    // Auto-initialization if script has data-auto-init attribute
    if (typeof document !== 'undefined') {
        var currentScript = document.currentScript || 
                           (function() {
                               var scripts = document.getElementsByTagName('script');
                               return scripts[scripts.length - 1];
                           })();
        
        if (currentScript && currentScript.getAttribute('data-auto-init') === 'true') {
            console.log('🚀 Auto-initializing ElementTracker...');
            setTimeout(function() {
                ElementTrackerAPI.enableElementTracking();
                
                var adminUrl = currentScript.getAttribute('data-admin-url') || 'http://localhost:5203/';
                ElementTrackerAPI.connect(adminUrl);
                
                console.log('🎉 ElementTracker auto-initialized!');
            }, 100);
        }
    }
    
    return ElementTrackerAPI;
})); 