'use strict';

// I'm not putting this stuff in self-invoking-function - maybe you want
// to play with it in the console ;)

// region Generic

function PubSub() {
    this.events = {};
}

PubSub.prototype.on = function on(event, listener) {
    this.events[event] = this.events[event] || [];
    this.events[event].push(listener);

    return this;
};

PubSub.prototype.off = function off(event, listener) {
    if (!this.events[event]) {
        return false;
    }

    let listenerIdx = this.events[event].indexOf(listener);

    if (listenerIdx === -1) {
        return false;
    } else {
        this.events[event].splice(listenerIdx, 1);

        if (this.events[event].length === 0) {
            delete this.events[event];
        }

        return true;
    }
};

PubSub.prototype.once = function once(event, listener) {
    function wrapper() {
        listener.apply(this, arguments);
        this.off(event, wrapper);
    }

    return this.on(event, wrapper);
};

PubSub.prototype.trigger = function trigger(event) {
    let args = Array.prototype.slice.call(arguments, 1, arguments.length);

    if (!this.events[event]) {
        return this;
    }

    this.events[event].forEach(listener => {
        listener.apply(this, args);
    });

    return this;
};

// endregion

// region Flickr

function flickrApiRequest(params, httpMethod) {
    let xhr = new XMLHttpRequest();
    let serializedParams = _(params)
        .toPairs()
        .map(p => encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]))
        .join('&');

    xhr.open(
        httpMethod || 'GET',
        'https://api.flickr.com/services/rest/?format=json&nojsoncallback=1&' +
            serializedParams
    );

    let promise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', function onLoad() {
            resolve(JSON.parse(this.responseText), this.status, this);
        });
        xhr.addEventListener('error', function onError() {
            reject(this);
        });
    });

    xhr.send();
    return promise;
}

function FlickrSearch(phrase, pageSize) {
    PubSub.call(this);

    if (pageSize < 5) {
        throw new Error('The minimum size of page is 5.');
    }

    let idx = 0;

    this.status = null;
    this.cache = [];

    this.loadMore = function loadMore() {
        let nextPageNumber = Math.floor(this.cache.length / pageSize) + 1;

        if (this.status === FlickrSearch.statuses.FULL) {
            return;
        }

        this.status = FlickrSearch.statuses.PENDING;
        this.trigger(FlickrSearch.events.PENDING, nextPageNumber);

        flickrApiRequest({
            method: 'flickr.photos.search',
            api_key: 'ee9e060249cfbaad0a7799fd4fc6bf73',
            text: phrase,
            page: nextPageNumber,
            per_page: pageSize
        }).then(data => {
            this.cache = this.cache.concat(data.photos.photo);

            if (data.photos.page >= data.photos.pages) {
                this.status = FlickrSearch.statuses.FULL;
            } else {
                this.status = FlickrSearch.statuses.READY;
            }

            this.trigger(FlickrSearch.events.READY);
        });
    };

    this.next = function next() {
        if (
            this.cache.length - idx - 1 <= Math.floor(0.25 * pageSize) &&
            this.status !== FlickrSearch.statuses.PENDING
        ) {
            this.loadMore();
        }

        return (idx < this.cache.length - 1) ? this.cache[++idx] : null;
    };

    this.prev = function prev() {
        return (idx > 0) ? this.cache[--idx] : null;
    };

    this.current = function current(relative) {
        return this.cache[idx + (relative || 0)];
    };

    this.loadMore();
}

FlickrSearch.prototype = new PubSub();
FlickrSearch.prototype.constructor = FlickrSearch;

FlickrSearch.statuses = {
    READY: 'ready',
    PENDING: 'pending',
    FULL: 'full'
};

FlickrSearch.events = {
    READY: 'ready',
    PENDING: 'pending'
};

// endregion

// region Gallery

function Gallery(settings) {
    if (!_.isObject(settings)) {
        throw new Error('You must provide settings object.');
    }

    if (settings.length && settings.length < 3) {
        throw new Error('The minimum size of gallery is 3.');
    }

    settings.length = settings.length || 9;
    this.gallery = settings.el;
    this.frames = [];

    function onFrameClick(event) {
        let clickedIdx = this.frames.indexOf(event.currentTarget);
        let activeIdx = this.frames.indexOf(this.gallery.querySelector('.active'));

        if (_.isFunction(settings.onFrameClick)) {
            settings.onFrameClick.call(this, event, clickedIdx, activeIdx);
        }
    }

    function stylingFunc(el, i) {
        let framesLength = this.frames.length;
        let step = 1 / framesLength * 2;
        let activeIdx = Math.floor(framesLength / 2);
        let shift;
        let style;

        el.classList.remove('active');

        if (i === 0) {
            style = {
                left: 0,
                transform: `rotateY(30deg) translate3d(-100%, 0, 0) scale(${step})`,
                opacity: 0,
                zIndex: '',
                '-webkit-filter': `brightness(${step})`
            };
        } else if (i === framesLength - 1) {
            style = {
                left: '100%',
                transform: `rotateY(-30deg) translate3d(0, 0, 0) scale(${step})`,
                opacity: 0,
                zIndex: -framesLength,
                '-webkit-filter': `brightness(${step})`
            };
        } else if (i < activeIdx) {
            shift = step * (i + 1);
            style = {
                left: 0,
                transform: `rotateY(30deg) translate3d(calc(-20% + ${25 * shift}vw), 0, 0) scale(${shift})`,
                opacity: 1,
                zIndex: '',
                '-webkit-filter': `brightness(${shift})`
            };
        } else if (i > activeIdx) {
            shift = step * (framesLength - i);
            style = {
                left: `calc(100% - ${el.offsetWidth}px)`,
                transform: `rotateY(-30deg) translate3d(calc(20% - ${25 * shift}vw), 0, 0) scale(${shift})`,
                opacity: 1,
                zIndex: (activeIdx - i),
                '-webkit-filter': `brightness(${shift})`
            }
        } else {
            style = {
                left: '50%',
                transform: 'rotateY(0) translate3d(-50%, 0, 0)',
                opacity: 1,
                zIndex: '',
                '-webkit-filter': ''
            };
            el.classList.add('active');
        }

        _.assign(el.style, style);
    }

    this.init = function init(imgSources) {
        let docFragment = document.createDocumentFragment();

        this.gallery.innerHTML = '';

        for (let i = 0; i < settings.length; i++) {
            let frame = document.createElement('div');
            let img = document.createElement('img');
            frame.classList.add('frame');
            frame.addEventListener('click', onFrameClick.bind(this));

            if (i >= settings.length - imgSources.length) {
                img.src = imgSources[imgSources.length - settings.length + i];
            } else {
                frame.classList.add('placeholder');
            }

            frame.appendChild(img);
            docFragment.appendChild(frame);
            this.frames.push(frame);

        }

        this.gallery.appendChild(docFragment);
        this.calcPosition();
    };

    this.calcPosition = function calcPosition() {
        this.frames.forEach((
            _.isFunction(settings.stylingFunc) ? settings.stylingFunc : stylingFunc
        ).bind(this));
    };

    this.go = function go(direction, url) {
        let active = this.gallery.querySelector('.active');

        if (!url &&
            (active.nextSibling.classList.contains('placeholder') && direction > 0 ||
            active.previousSibling.classList.contains('placeholder') && direction < 0)
        ) {
            return;
        }

        let frame = (direction >= 0) ? this.frames.shift() : this.frames.pop();
        let img = frame.querySelector('img');

        this.gallery.removeChild(frame);
        frame.removeChild(img);
        frame.classList.remove('placeholder');
        img = document.createElement('img');
        frame.appendChild(img);

        if (url) {
            img.src = url;
        } else {
            frame.classList.add('placeholder');
            img.src = '';
        }

        if (direction > 0) {
            this.gallery.appendChild(frame);
            this.frames.push(frame);
        } else if (direction < 0) {
            this.gallery.insertBefore(frame, this.frames[0]);
            this.frames.unshift(frame);
        }

        this.calcPosition();
    };

    this.next = this.go.bind(this, 1);
    this.prev = this.go.bind(this, -1);
}

// endregion

function constructPhotoUrl(photo) {
    return `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_n.jpg`;
}

document.querySelector('#flickr-search').addEventListener('submit', event => {
    event.preventDefault();

    let phrase = event.currentTarget.querySelector('[name="phrase"]');
    let galleryLength = parseInt(event.currentTarget.querySelector('[name="galleryLength"]').value, 10);
    let flickrSearch;
    let gallery;

    if (phrase.value === '') {
        alert('You must write something ;)');
        return;
    }

    try {
        flickrSearch = new FlickrSearch(phrase.value, galleryLength);
        gallery = new Gallery({
            length: galleryLength,
            el: document.querySelector('.gallery'),
            onFrameClick: function onFrameClick(event, clickedIdx, activeIdx) {
                let photo;

                if (clickedIdx > activeIdx) {
                    photo = flickrSearch.next();

                    if (photo) {
                        this.next(constructPhotoUrl(photo));
                    } else if (flickrSearch.status !== FlickrSearch.statuses.PENDING) {
                        this.next();
                    }
                } else if (clickedIdx < activeIdx) {
                    photo = flickrSearch.current(-galleryLength);

                    if (photo) {
                        flickrSearch.prev();
                        this.prev(constructPhotoUrl(photo));
                    } else if (flickrSearch.status !== FlickrSearch.statuses.PENDING) {
                        flickrSearch.prev();
                        this.prev();
                    }
                }
            }
        });
    } catch (error) {
        alert(`Error: ${error.message}`);
        return;
    }

    flickrSearch.once(FlickrSearch.events.READY, () => {
        let photoSetLength = Math.floor(galleryLength / 2);
        let photoSet = [constructPhotoUrl(flickrSearch.current())];

        for (let i = 0; i < photoSetLength; i++) {
            photoSet.push(constructPhotoUrl(flickrSearch.next()));
        }

        gallery.init(photoSet);
    });
});
