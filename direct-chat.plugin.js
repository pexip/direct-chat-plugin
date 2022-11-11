// Use IIFE (Immediately Invoked Function Expression) to wrap the plugin to not pollute global namespace with whatever is defined inside here
(function () {
    var rtc;
    var initiated = false;

    const svgns = 'http://www.w3.org/2000/svg';
    const xlinkns = 'http://www.w3.org/1999/xlink';

    const inboundElements = new Map();
    const messaggeHistoryMap = new Map();
    const messaggeIconMap = new Map();
    const displayedFrames = new Map();

    var jsFrame;

    class MessaggeHistoryEntry {
        constructor(payload, time, sender) {
            this.payload = payload;
            this.time = time;
            this.sender = sender;
        }
    }

    // Init function called by the PluginService when plugin is loaded
    function load(participants$, conferenceDetails$) {
        debugger;
        var script = document.createElement('script');
        script.setAttribute('type', 'text/javascript');
        script.setAttribute(
            'src',
            'custom_configuration/plugins/direct-chat-plugin/lib/jsframe.js'
        );

        document.getElementsByTagName('head')[0].appendChild(script);

        conferenceDetails$.subscribe(details => {
            if (details.started && !initiated) {
                jsFrame = new JSFrame();
                getMainPexRTC();
                var onChatMessageListener = rtc.onChatMessage;

                rtc.onChatMessage = function (message) {
                    if (message.direct) {
                        generateMessageIcon(message.uuid);
                        fillChatFrame(message);
                    } else {
                        onChatMessageListener(message);
                    }
                };

                initiated = true;
            }
        });
    }

    function generateDomElement(messaggeHistoryEntry, index, inboundElement) {
        const div = document.createElement('div');
        const p = document.createElement('p');
        const payload = document.createTextNode(messaggeHistoryEntry.payload);
        const span = document.createElement('span');
        const metaData = document.createTextNode(
            messaggeHistoryEntry.time + ' (' + messaggeHistoryEntry.sender + ')'
        );
        span.classList.add('time-right');

        div.appendChild(p);
        p.appendChild(payload);
        div.appendChild(span);
        span.appendChild(metaData);
        inboundElement.appendChild(div);
        div.classList.add('container');
        if (index % 2 == 1) {
            div.classList.add('darker');
        }
    }

    function setMessageIconReadState(readState, uuid) {
        var matchingMessageIcon = messaggeIconMap.get(uuid);

        if (!matchingMessageIcon) {
            return;
        }

        var use = matchingMessageIcon.getElementsByTagName('use')[0];
        if (!readState) {
            use.setAttributeNS(xlinkns, 'href', 'icons.svg#messages-green');
        } else {
            use.setAttributeNS(xlinkns, 'href', 'icons.svg#messages');
        }
    }

    function generateMessageIcon(uuid) {
        if (messaggeIconMap.has(uuid)) {
            if (!displayedFrames.has(uuid)) {
                setMessageIconReadState(false, uuid);
            } else {
                setMessageIconReadState(true, uuid);
            }
            //Leave function if message icon already exists
            return;
        }

        const li = document.createElement('li');
        const svg = document.createElementNS(svgns, 'svg');
        const use = document.createElementNS(svgns, 'use');

        //Li
        li.setAttribute(
            'class',
            'pex-roster-list__user-state sel-user-host smallconf ng-star-inserted'
        );
        //Svg
        svg.setAttribute(
            'class',
            'pex-roster-list__user-state-icon pex-roster-list__host-icon ng-star-inserted'
        );
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        //Use
        use.setAttributeNS(xlinkns, 'href', 'icons.svg#messages');

        //Build dom
        li.appendChild(svg);
        svg.appendChild(use);

        const roosterEntryElement = document.getElementById(uuid);
        const iconArea = roosterEntryElement.getElementsByClassName(
            'pex-roster-list__user-states'
        )[0];

        var ngContentTag = iconArea
            .getAttributeNames()
            .find(element => element.startsWith('_ngcontent'));

        li.setAttribute(ngContentTag, '');
        svg.setAttribute(ngContentTag, '');
        use.setAttribute(ngContentTag, '');

        messaggeIconMap.set(uuid, li);

        if (!displayedFrames.has(uuid)) {
            setMessageIconReadState(false, uuid);
        }

        iconArea.appendChild(li);
    }

    function fillFramelWithHistory(uuid) {
        var matchingMessageHistory = messaggeHistoryMap.get(uuid);

        var inboundElement = inboundElements.get(uuid);
        if (inboundElement && matchingMessageHistory) {
            matchingMessageHistory.forEach(function (item, index) {
                generateDomElement(item, index, inboundElement);
            });
        }
    }

    function fillChatFrame(message) {
        var matchingMessageHistory = messaggeHistoryMap.get(message.uuid);

        var latesMessage = new MessaggeHistoryEntry(
            message.payload,
            new Date().toLocaleTimeString(),
            message.origin
        );

        if (matchingMessageHistory) {
            matchingMessageHistory.push(latesMessage);
        } else {
            matchingMessageHistory = new Array(latesMessage);
            messaggeHistoryMap.set(message.uuid, matchingMessageHistory);
        }

        var inboundElement = inboundElements.get(message.uuid);
        if (inboundElement) {
            while (inboundElement.lastElementChild) {
                inboundElement.removeChild(inboundElement.lastElementChild);
            }
            matchingMessageHistory.forEach(function (item, index) {
                generateDomElement(item, index, inboundElement);
            });
        }
    }
    // context menu item functions
    function openChat(conferenceDetails) {
        if (!rtc) {
            return;
        }

        const uuid = conferenceDetails.uuid;
        const frame = jsFrame.create({
            title: 'Direct chat with ' + conferenceDetails.name,
            movable: true, //Enable to be moved by mouse
            resizable: true, //Enable to be resized by mouse
            width: 380,
            height: 400,
            url:
                'custom_configuration/plugins/direct-chat-plugin/assets/dialog.html',

            urlLoaded: frame => {
                //Position
                const x = window.innerWidth / 2;
                const y = window.innerHeight / 2;
                frame.setPosition(x - frame.getWidth()/ 2, y - frame.getHeight() / 2);

                //Process send message event
                frame.on('#sendMessageButton', 'click', (_frame, evt) => {
                    //Setupa
                    var payload = frame.$('#outboundChatMessageInput').value;
                    rtc.sendChatMessage(payload, uuid);
                    fillChatFrame({
                        uuid: uuid,
                        payload: payload,
                        origin: 'You'
                    });
                    generateMessageIcon(uuid);
                });

                frame.on('#dialog', 'click', (_frame, evt) => {
                    _frame.requestFocus();
                });

                //Process close frame event
                frame.on('closeButton', 'click', (_frame, evt) => {
                    frame.closeFrame();
                    displayedFrames.delete(uuid);
                });

                //Process close frame event
                frame.on('frame', 'move', (data) => {

                    var x = data.pos.x;
                    var y = data.pos.y;

                    if(data.pos.y <= 0){
                        y = 0;
                    };

                    if(data.pos.x <= 0){
                        x = 0;
                    };


                    if(data.pos.y + data.size.height > window.innerHeight){
                        y = window.innerHeight - data.size.height;
                    };

                    if(data.pos.x + data.size.width > window.innerWidth){
                        x = window.innerWidth - data.size.width;
                    };

                    data.target.setPosition(x,y,'LEFT_TOP');
                });

                var inbound = frame.$('#messagePanel');

                inboundElements.set(uuid, inbound);
                displayedFrames.set(uuid, frame);
                frame.show();
                setMessageIconReadState(true, uuid);
                fillFramelWithHistory(uuid);
            }
        });
        //Show the window
    }

    // unload / cleanup function
    function unload() {
        // clean up any globals or other cruft before being removed before i get killed.
        console.log('unload direct chat plugin');
    }

    // Register our plugin with the PluginService - make sure id matches your package.json
    PEX.pluginAPI.registerPlugin({
        id: 'direct-chat-plugin-1.0',
        load: load,
        unload: unload,
        openChat: openChat
    });

    function getMainPexRTC() {
        if (rtc) {
            return;
        }

        var objs = []; //store the object references in this array
        var found = false;
        function walkTheObject(obj) {
            var keys = Object.keys(obj); // get all own property names of the object

            keys.forEach(function (key) {
                if (found) return;
                var value = obj[key]; // get property value

                //if the property value is an object
                if (value && typeof value === 'object') {
                    // if we don´t have this referece
                    if (objs.indexOf(value) < 0) {
                        objs.push(value); // store the reference
                        if (
                            value.constructor &&
                            value.constructor.name &&
                            value.constructor.name == 'PexRTC'
                        ) {
                            rtc = value;
                            found = true;
                        }
                        walkTheObject(value);
                    }
                }
            });
        }

        walkTheObject(window);
        objs = [];
    }
})(); // End IIFE
