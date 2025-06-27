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
    }

    WebSocketService.prototype.connect = function(adminDashboardUrl) {
        adminDashboardUrl = adminDashboardUrl || 'ws://localhost:5203/';
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

            // Convert HTTP URL to WebSocket URL if needed
            var wsUrl = adminDashboardUrl.replace(/^http/, 'ws');
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = function() {
                console.log('Connected to admin dashboard');
                self.isConnected = true;
                self.isConnecting = false;
                self.connectionAttempts = 0;
            };

            this.socket.onclose = function(event) {
                console.log('Disconnected from admin dashboard: Code ' + event.code + ' - ' + event.reason);
                self.isConnected = false;
                self.isConnecting = false;
                
                if (event.code !== 1000 && self.connectionAttempts < self.maxConnectionAttempts) {
                    console.log('Will retry connection in 5 seconds (attempt ' + self.connectionAttempts + '/' + self.maxConnectionAttempts + ')');
                    
                    if (self.reconnectTimer) {
                        clearTimeout(self.reconnectTimer);
                    }
                    
                    self.reconnectTimer = setTimeout(function() {
                        self.connect(adminDashboardUrl);
                    }, 5000);
                }
            };

            this.socket.onerror = function(error) {
                console.error('WebSocket connection error:', error);
                self.isConnected = false;
            };

            this.socket.onmessage = function(event) {
                try {
                    var message = JSON.parse(event.data);
                    if (message.type === 'element-clicked') {
                        self.onElementClickCallbacks.forEach(function(cb) {
                            cb(message);
                        });
                    } else if (message.type === 'inject-instruction') {
                        var instruction = message.data;
                        self.handleInstruction(instruction);
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
            
            if (this.connectionAttempts < this.maxConnectionAttempts) {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                }
                
                var self = this;
                this.reconnectTimer = setTimeout(function() {
                    self.connect(adminDashboardUrl);
                }, 5000);
            }
        }
    };

    WebSocketService.prototype.sendElementClick = function(elementData) {
        if (this.socket && this.isConnected) {
            try {
                var message = {
                    type: 'element-clicked',
                    data: elementData
                };
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                console.error('Error sending element click data:', error);
            }
        }
    };

    WebSocketService.prototype.disconnect = function() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    };

    WebSocketService.prototype.handleInstruction = function(instruction) {
        // Handle instructions from admin dashboard
        console.log('Received instruction:', instruction);
    };

    // Element Clicking Tracker Class
    function ElementClickingTracker() {
        this.enabled = false;
        this.previouslyFocusedElements = new Set();
        this.throttledClickHandler = null;
        this.websocketService = new WebSocketService();
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
            
            // Special handling for labels
            if (tagName === 'label') {
                event.preventDefault();
            }
            
            // Remove focus from any currently focused element
            if (document.activeElement && document.activeElement !== element) {
                document.activeElement.blur();
            }
            
            // Remove visual styling from all previously focused elements
            self.previouslyFocusedElements.forEach(function(prevElement) {
                if (prevElement !== element) {
                    prevElement.style.outline = '';
                    prevElement.style.outlineOffset = '';
                }
            });
            
            // Add focus to the clicked element
            if (element && typeof element.focus === 'function') {
                var focusableElements = ['input', 'button', 'select', 'textarea', 'a', 'label'];
                var isFocusable = focusableElements.indexOf(tagName) !== -1 || 
                               element.hasAttribute('tabindex') || 
                               element.hasAttribute('contenteditable');
                
                var originalOutline = element.style.outline;
                var originalOutlineOffset = element.style.outlineOffset;
                
                var applyBlueFocus = function() {
                    element.style.outline = '2px solid #007bff';
                    element.style.outlineOffset = '2px';
                };
                
                if (isFocusable) {
                    element.focus();
                    applyBlueFocus();
                    self.previouslyFocusedElements.add(element);
                    console.log('Focus applied to element:', self.getElementPath(element));
                } else {
                    // For non-focusable elements, make them focusable temporarily
                    var originalTabIndex = element.getAttribute('tabindex');
                    element.setAttribute('tabindex', '-1');
                    element.focus();
                    applyBlueFocus();
                    self.previouslyFocusedElements.add(element);
                    console.log('Focus applied to non-focusable element:', self.getElementPath(element));
                    
                    var handleBlur = function() {
                        element.style.outline = originalOutline;
                        element.style.outlineOffset = originalOutlineOffset;
                        if (originalTabIndex === null) {
                            element.removeAttribute('tabindex');
                        } else {
                            element.setAttribute('tabindex', originalTabIndex);
                        }
                        self.previouslyFocusedElements.delete(element);
                        element.removeEventListener('blur', handleBlur);
                    };
                    
                    element.addEventListener('blur', handleBlur);
                    
                    // Send element data
                    self.sendElementData(element);
                    return;
                }
                
                var handleBlur = function() {
                    element.style.outline = originalOutline;
                    element.style.outlineOffset = originalOutlineOffset;
                    self.previouslyFocusedElements.delete(element);
                    element.removeEventListener('blur', handleBlur);
                };
                
                element.addEventListener('blur', handleBlur);
            }
            
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

        // Clear all focused elements
        var self = this;
        this.previouslyFocusedElements.forEach(function(element) {
            element.style.outline = '';
            element.style.outlineOffset = '';
        });
        this.previouslyFocusedElements.clear();

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

    ElementClickingTracker.prototype.sendElementData = function(element) {
        var tagName = element.tagName ? element.tagName.toLowerCase() : '';
        var id = element.id || null;
        var className = element.className || null;
        
        // Extract attributes
        var attributes = {};
        if (element.attributes) {
            for (var i = 0; i < element.attributes.length; i++) {
                var attr = element.attributes[i];
                if (attr.name !== 'class' && attr.name !== 'id' && attr.name !== 'style') {
                    attributes[attr.name] = attr.value;
                }
            }
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
        
        this.websocketService.sendElementClick(elementData);
    };

    // Create instances
    var websocketService = new WebSocketService();
    var elementTracker = new ElementClickingTracker();

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
        
        // Properties
        get isConnected() {
            return websocketService.isConnected;
        },
        
        get isTrackingEnabled() {
            return elementTracker.enabled;
        },
        
        // Direct access to services (for advanced usage)
        websocketService: websocketService,
        elementTracker: elementTracker
    };
})); 