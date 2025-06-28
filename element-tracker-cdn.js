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
        this.isDynaDubbing = false;

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

        console.log('🔄 ElementTracker: Starting connection to', adminDashboardUrl);

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
            console.log('🌐 Connecting to WebSocket URL:', wsUrl);
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = function() {
                console.log('✅ Connected to admin dashboard');
                console.log('🎉 WebSocket connection established successfully!');
                self.isConnected = true;
                self.isConnecting = false;
                // Reset connection attempts on successful connection
                self.connectionAttempts = 0;
            };

            this.socket.onclose = function(event) {
                console.log('❌ Disconnected from admin dashboard: Code ' + event.code + ' - ' + event.reason);
                if (event.code === 1006) {
                    console.error('🚫 Connection failed - Server not reachable at ' + adminDashboardUrl);
                    console.info('💡 Make sure your admin dashboard is running on ' + adminDashboardUrl);
                }
                self.isConnected = false;
                self.isConnecting = false;
                
                // If not a normal closure and we haven't reached max attempts, try to reconnect
                if (event.code !== 1000 && self.connectionAttempts < self.maxConnectionAttempts) {
                    console.log('🔄 Will retry connection in 5 seconds (attempt ' + self.connectionAttempts + '/' + self.maxConnectionAttempts + ')');
                    
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
                console.error('⚠️ WebSocket connection error:', error);
                console.error('🔍 Check if admin dashboard is running on:', adminDashboardUrl);
                self.isConnected = false;
                // The onclose handler will be called after this, which will handle reconnection
            };

            this.socket.onmessage = function(event) {
                try {
                    console.log('📨 CDN: Raw WebSocket message received:', event.data);
                    var message = JSON.parse(event.data);
                    console.log('📦 CDN: Parsed message:', message);
                    
                    if (message.type === 'element-clicked') {
                        console.log('🖱️ CDN: Element click message received');
                        self.onElementClickCallbacks.forEach(function(cb) {
                            cb(message);
                        });
                    } else if (message.type === 'inject-instruction') {
                        console.log('📝 CDN: Instruction message received');
                        
                        // Enhanced instruction data validation
                        var instruction = message.data;
                        console.log('🔍 CDN: Raw instruction data:', instruction);
                        console.log('🔍 CDN: Instruction data type:', typeof instruction);
                        console.log('🔍 CDN: Instruction data keys:', instruction ? Object.keys(instruction) : 'null/undefined');
                        
                        if (!instruction) {
                            console.error('❌ CDN: message.data is null or undefined!');
                            console.error('❌ CDN: Full message:', message);
                            return;
                        }

                        // Process the instruction
                        self.handleInstruction(instruction);
                        
                        // Notify callbacks
                        self.onInstructionCallbacks.forEach(function(cb) {
                            try {
                                cb(instruction);
                            } catch (callbackError) {
                                console.error('❌ CDN: Error in instruction callback:', callbackError);
                            }
                        });
                    } else {
                        console.log('❓ CDN: Unknown message type:', message.type);
                        console.log('📋 CDN: Full message:', message);
                    }
                } catch (err) {
                    console.error('❌ CDN: Error parsing WebSocket message:', err);
                    console.error('❌ CDN: Raw message data:', event.data);
                    console.error('❌ CDN: Error details:', err.message);
                }
            };

            // Add timeout to detect hanging connections
            setTimeout(function() {
                if (self.isConnecting && !self.isConnected) {
                    console.warn('⏰ Connection timeout - taking longer than expected');
                    console.info('🔍 Server might be starting up or not responding');
                }
            }, 5000);

        } catch (error) {
            console.error('❌ Failed to connect to admin dashboard:', error);
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
        console.log('🔍 CDN: Checking if instruction should apply:');
        console.log('   - instruction.publish:', instruction.publish);
        console.log('   - this.isDynaDubbing:', this.isDynaDubbing);
        
        // FORCE APPLY ALL INSTRUCTIONS - Override for CDN compatibility
        var shouldApply = true; // Always apply instructions in CDN mode
        console.log('   - Final decision: FORCE APPLY (CDN mode)');
        
        return shouldApply;
    };

    // Handle instructions received from the admin dashboard
    WebSocketService.prototype.handleInstruction = function(instruction) {
        console.log('🔧 CDN: handleInstruction called with:', instruction);
        
        // Enhanced null checking and debugging
        if (!instruction) {
            console.error('❌ CDN: Instruction is null or undefined!');
            return;
        }
        
        console.log('🔍 CDN: Instruction validation:');
        console.log('   - instruction:', typeof instruction, instruction);
        console.log('   - instruction.id:', instruction.id);
        console.log('   - instruction.action:', instruction.action);
        console.log('   - instruction.selector:', instruction.selector);
        console.log('   - instruction.content:', instruction.content);
        console.log('   - instruction.publish:', instruction.publish);
        console.log('   - instruction.timestamp:', instruction.timestamp);
        
        // Check for null/undefined values
        var issues = [];
        if (!instruction.id) issues.push('id is missing');
        if (!instruction.action) issues.push('action is missing');
        if (!instruction.selector) issues.push('selector is missing');
        
        if (issues.length > 0) {
            console.error('❌ CDN: Instruction validation failed:');
            issues.forEach(function(issue) {
                console.error('   - ' + issue);
            });
            console.error('❌ CDN: Cannot process instruction with missing required fields');
            return;
        }
        
        if (!this.shouldApplyInstruction(instruction)) {
            console.log('❌ CDN: Instruction ignored (not published and not dubbing mode)');
            console.log('💡 CDN: To apply instructions, either:');
            console.log('   1. Set instruction.publish = true in admin dashboard');
            console.log('   2. Enable dyna dubbing: ElementTracker.setDynaDubbing(true)');
            return;
        }

        console.log('✅ CDN: Applying instruction:', instruction.action, 'on', instruction.selector);

        try {
            switch (instruction.action) {
                case 'appendHTML':
                    this.appendHTML(instruction);
                    break;
                case 'replaceHTML':
                    this.replaceHTML(instruction);
                    break;
                case 'removeElement':
                    this.removeElement(instruction);
                    break;
                default:
                    console.warn('❌ CDN: Unknown instruction action:', instruction.action);
                    console.log('📋 CDN: Supported actions: appendHTML, replaceHTML, removeElement');
            }
        } catch (error) {
            console.error('❌ CDN: Error handling instruction:', error);
            console.error('❌ CDN: Error details:', error.message);
            console.error('❌ CDN: Stack trace:', error.stack);
        }
    };

    // Append HTML content to an element
    WebSocketService.prototype.appendHTML = function(instruction) {
        console.log('📝 CDN: appendHTML called with:', instruction);
        
        // Enhanced validation with specific null checks
        console.log('🔍 CDN: appendHTML validation:');
        console.log('   - instruction:', instruction);
        console.log('   - instruction.selector:', instruction ? instruction.selector : 'instruction is null');
        console.log('   - instruction.content:', instruction ? instruction.content : 'instruction is null');
        console.log('   - instruction.id:', instruction ? instruction.id : 'instruction is null');
        
        if (!instruction) {
            console.error('❌ CDN: appendHTML - instruction is null or undefined');
            return;
        }
        
        if (!instruction.selector) {
            console.error('❌ CDN: appendHTML - selector is null, undefined, or empty');
            console.error('   - selector value:', instruction.selector);
            console.error('   - selector type:', typeof instruction.selector);
            return;
        }
        
        if (instruction.content === null || instruction.content === undefined) {
            console.error('❌ CDN: appendHTML - content is null or undefined');
            console.error('   - content value:', instruction.content);
            console.error('   - content type:', typeof instruction.content);
            return;
        }

        try {
            console.log('🔍 CDN: Searching for element with selector:', instruction.selector);
            var element = document.querySelector(instruction.selector);
            console.log('🔍 CDN: Found element for selector "' + instruction.selector + '":', element);
            console.log('🔍 CDN: Element type:', element ? element.tagName : 'null');
            console.log('🔍 CDN: Element id:', element ? element.id : 'null');
            console.log('🔍 CDN: Element class:', element ? element.className : 'null');
            
            if (!element) {
                console.error('❌ CDN: Element not found for selector: ' + instruction.selector);
                console.log('🔍 CDN: Available elements on page:', document.querySelectorAll('*').length);
                console.log('🔍 CDN: Similar elements:', document.querySelectorAll(instruction.selector.split(' ')[0] || '*').length);
                return;
            }

            // Save the original content before modification
            var originalContent = element.innerHTML;
            console.log('📋 CDN: Original content length:', originalContent.length);
            console.log('📋 CDN: Original content preview:', originalContent.substring(0, 100) + (originalContent.length > 100 ? '...' : ''));
            
            // Append the new content
            console.log('➕ CDN: Appending content:', instruction.content);
            console.log('➕ CDN: Content length:', instruction.content.length);
            element.innerHTML += instruction.content;
            console.log('➕ CDN: New total content length:', element.innerHTML.length);
            
            // Store the injected content for potential reversion
            var injectionData = {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                content: instruction.content,
                originalContent: originalContent,
                element: element,
                timestamp: instruction.timestamp
            };
            this.injectedContents.set(instruction.id, injectionData);
            console.log('💾 CDN: Stored injection data for ID:', instruction.id);
            
            console.log('✅ CDN: Successfully appended HTML to ' + instruction.selector);
        } catch (error) {
            console.error('❌ CDN: Error appending HTML:', error);
            console.error('❌ CDN: Error message:', error.message);
            console.error('❌ CDN: Error stack:', error.stack);
        }
    };

    // Replace HTML content of an element
    WebSocketService.prototype.replaceHTML = function(instruction) {
        console.log('🔄 CDN: replaceHTML called with:', instruction);
        
        if (!instruction.selector || !instruction.content) {
            console.error('Invalid replace instruction: Missing selector or content');
            return;
        }

        try {
            var element = document.querySelector(instruction.selector);
            console.log('🔍 CDN: Found element for selector "' + instruction.selector + '":', element);
            
            if (!element) {
                console.warn('Element not found for selector: ' + instruction.selector);
                return;
            }

            // Save the original content before replacement
            var originalContent = element.innerHTML;
            console.log('📋 CDN: Original content:', originalContent.substring(0, 100) + '...');
            
            // Replace the content
            element.innerHTML = instruction.content;
            console.log('🔄 CDN: Replaced with content:', instruction.content);
            
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
            
            console.log('✅ CDN: Successfully replaced HTML in ' + instruction.selector);
        } catch (error) {
            console.error('❌ CDN: Error replacing HTML:', error);
        }
    };

    // Remove an element from the DOM
    WebSocketService.prototype.removeElement = function(instruction) {
        console.log('🗑️ CDN: removeElement called with:', instruction);
        
        // Enhanced validation with specific null checks
        console.log('🔍 CDN: removeElement validation:');
        console.log('   - instruction:', instruction);
        console.log('   - instruction.selector:', instruction ? instruction.selector : 'instruction is null');
        console.log('   - instruction.id:', instruction ? instruction.id : 'instruction is null');
        
        if (!instruction) {
            console.error('❌ CDN: removeElement - instruction is null or undefined');
            return;
        }
        
        if (!instruction.selector) {
            console.error('❌ CDN: removeElement - selector is null, undefined, or empty');
            console.error('   - selector value:', instruction.selector);
            console.error('   - selector type:', typeof instruction.selector);
            return;
        }

        try {
            console.log('🔍 CDN: Searching for element to remove with selector:', instruction.selector);
            var element = document.querySelector(instruction.selector);
            console.log('🔍 CDN: Found element for selector "' + instruction.selector + '":', element);
            console.log('🔍 CDN: Element type:', element ? element.tagName : 'null');
            console.log('🔍 CDN: Element id:', element ? element.id : 'null');
            console.log('🔍 CDN: Element class:', element ? element.className : 'null');
            console.log('🔍 CDN: Element text content:', element ? element.textContent.substring(0, 50) + '...' : 'null');
            
            if (!element) {
                console.error('❌ CDN: Element not found for selector: ' + instruction.selector);
                console.log('🔍 CDN: Available elements on page:', document.querySelectorAll('*').length);
                console.log('🔍 CDN: Checking if selector syntax is valid...');
                
                // Try to validate selector
                try {
                    document.querySelectorAll(instruction.selector);
                    console.log('✅ CDN: Selector syntax is valid, but no matching elements found');
                } catch (selectorError) {
                    console.error('❌ CDN: Invalid selector syntax:', selectorError.message);
                }
                
                // Show similar elements if possible
                var baseSelector = instruction.selector.split(' ')[0] || instruction.selector.split('>')[0] || instruction.selector.split(':')[0];
                if (baseSelector) {
                    var similarElements = document.querySelectorAll(baseSelector);
                    console.log('🔍 CDN: Similar elements found for "' + baseSelector + '":', similarElements.length);
                }
                
                return;
            }

            // Save reference to parent and next sibling for potential restoration
            var parent = element.parentNode;
            var nextSibling = element.nextSibling;
            console.log('👪 CDN: Element parent:', parent);
            console.log('👪 CDN: Element next sibling:', nextSibling);
            console.log('👪 CDN: Element position in parent:', parent ? Array.from(parent.children).indexOf(element) : 'no parent');
            
            // Store the removed element data for potential reversion
            var removalData = {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                originalContent: element.outerHTML,
                element: element,
                parent: parent,
                nextSibling: nextSibling,
                timestamp: instruction.timestamp
            };
            this.injectedContents.set(instruction.id, removalData);
            console.log('💾 CDN: Stored removal data for ID:', instruction.id);
            
            // Remove the element
            if (parent) {
                console.log('🗑️ CDN: Removing element from parent...');
                parent.removeChild(element);
                console.log('✅ CDN: Successfully removed element ' + instruction.selector);
                
                // Verify removal
                var checkElement = document.querySelector(instruction.selector);
                if (checkElement) {
                    console.warn('⚠️ CDN: Element still exists after removal attempt');
                    console.log('⚠️ CDN: Remaining element:', checkElement);
                } else {
                    console.log('✅ CDN: Confirmed element has been removed from DOM');
                }
            } else {
                console.error('❌ CDN: No parent found, cannot remove element');
                console.log('❌ CDN: Element is likely already detached from DOM');
            }
            
        } catch (error) {
            console.error('❌ CDN: Error removing element:', error);
            console.error('❌ CDN: Error message:', error.message);
            console.error('❌ CDN: Error stack:', error.stack);
            console.error('❌ CDN: Problematic selector:', instruction.selector);
        }
    };

    // Get all active injections
    WebSocketService.prototype.getInjections = function() {
        return Array.from(this.injectedContents.values());
    };

    // Send element click data to the server
    WebSocketService.prototype.sendElementClick = function(elementData) {
        console.log('🔍 CDN: sendElementClick called with data:', elementData);
        
        if (this.socket && this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            var messageToSend = {
                type: 'element-clicked',
                data: elementData,
                timestamp: new Date().toISOString()
            };
            
            console.log('🔍 CDN: Sending WebSocket message:', messageToSend);
            this.socket.send(JSON.stringify(messageToSend));
            console.log('✅ CDN: Message sent successfully');
        } else {
            console.warn('WebSocket not connected. Cannot send element data.');
            console.log('🔍 CDN: WebSocket state - connected:', this.isConnected, 'socket:', !!this.socket, 'readyState:', this.socket ? this.socket.readyState : 'no socket');
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