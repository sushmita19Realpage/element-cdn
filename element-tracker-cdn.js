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
                    var message = JSON.parse(event.data);
                    if (message.type === 'element-clicked') {
                        self.onElementClickCallbacks.forEach(function(cb) {
                            cb(message);
                        });
                    } else if (message.type === 'inject-instruction') {
                        // Handle instruction from admin dashboard
                        var instruction = message.data;
                        console.log('📝 Received instruction:', instruction);

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
        // Only apply if publish is true or isDynaDubbing is true
        return instruction.publish === true || this.isDynaDubbing;
    };

    // Handle instructions received from the admin dashboard
    WebSocketService.prototype.handleInstruction = function(instruction) {
        if (!this.shouldApplyInstruction(instruction)) {
            console.log('Instruction ignored (not published and not dubbing mode)');
            return;
        }

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
                    console.warn('Unknown instruction action:', instruction.action);
            }
        } catch (error) {
            console.error('Error handling instruction:', error);
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
        if (!instruction.selector || !instruction.content) {
            console.error('Invalid replace instruction: Missing selector or content');
            return;
        }

        try {
            var element = document.querySelector(instruction.selector);
            if (!element) {
                console.warn('Element not found for selector: ' + instruction.selector);
                return;
            }

            // Save the original content before replacement
            var originalContent = element.innerHTML;
            
            // Replace the content
            element.innerHTML = instruction.content;
            
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
            
            console.log('Successfully replaced HTML in ' + instruction.selector);
        } catch (error) {
            console.error('Error replacing HTML:', error);
        }
    };

    // Remove an element from the DOM
    WebSocketService.prototype.removeElement = function(instruction) {
        if (!instruction.selector) {
            console.error('Invalid remove instruction: Missing selector');
            return;
        }

        try {
            var element = document.querySelector(instruction.selector);
            console.log(element);
            if (!element) {
                console.warn('Element not found for selector: ' + instruction.selector);
                return;
            }

            // Save reference to parent and next sibling for potential restoration
            var parent = element.parentNode;
            
            // Store the removed element data for potential reversion
            this.injectedContents.set(instruction.id, {
                id: instruction.id,
                action: instruction.action,
                selector: instruction.selector,
                originalContent: element.outerHTML,
                element: element,
                timestamp: instruction.timestamp
            });
            
            // Remove the element
            if (parent) {
                parent.removeChild(element);
            }
            
            console.log('Successfully removed element ' + instruction.selector);
        } catch (error) {
            console.error('Error removing element:', error);
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

    // Public API
    return {
        // Main methods
        enableElementTracking: function() {
            elementTracker.enable();
        },
        
        disableElementTracking: function() {
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
        elementTracker: elementTracker
    };
})); 