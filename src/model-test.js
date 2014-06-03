;(function (win) {
    
    function type (data) {
        var type = data instanceof Model ? "model" 
                    : Object.prototype.toString.call(data).slice(8, -1).toLowerCase();
        return type;
    }

    function nextTick (fn) {
        setTimeout(fn, 0);
    }

    var modelKey = "__mvvm_proto__";

    function createEvent () {
        var event_proto = Object.create(EventPrototype);

        // 多套一层原型的目的是为了输出得event自身是干净的。
        // 在chrome中，对象上的属性如果在原型上且不可枚举，则不会默认打印出来
        // 因为有些属性是私有属性，不能放在原型上
        // 但如果放在对象上，会在console.log时把这些私有属性打印出来
        // 所以多套了一层，否则直接写在对象上即可
        event_proto[modelKey] = {
            events: {}
        };
        Object.defineProperty(event_proto, modelKey, {
            configurable: false,
            writable: true,
            enumerable: false
        });
        // 子属性不可扩展，但更深的属性不受限制
        Object.preventExtensions(event_proto);

        var event = Object.create(event_proto);
        return event;
    }

    var EventPrototype = Object.create({});
    EventPrototype.on = function (type, callback) {
        if (!this._events) {
            this._events = {};
        };
        if (!this._events[type]) {
            this._events[type] = [];
        };
        this._events[type].push(callback);
    }
    EventPrototype.emit = function (type) {
        if (!this._events) {
            this._events = {};
        };
        var args = Array.prototype.slice.call(arguments, 1);
        var arr = this._events[type];

        if (!arr || !arr.length) {
            return;
        };
        for (var i = 0; i < arr.length; i++) {
            arr[i].apply(this, args);
        };
    }

    // 原型上的属性可读不可删可改不会被遍历不可扩展
    Object.keys(EventPrototype).forEach(function (key) {
        Object.defineProperty(EventPrototype, key, {
            configurable: false,
            writable: false,
            enumerable: false
        });
        Object.preventExtensions(EventPrototype);
    })

    function createModel () {
        var model_proto = Object.create(ModelPrototype);
        model_proto[modelKey] = {
            
        }
        var model = Object.create(event);
    }

    var ModelPrototype = Object.create(createEvent());


    function Model () {
        Event.call(this);
        this._parentModel = null;
        this._parentModelKey = "";
        this._data = {};
        var keys = Object.keys(this);
        var _this = this;
        keys.forEach(function (key) {
            console.log(_this,2)
            Object.defineProperty(_this, key, {
                enumerable : false
            });
        })
        console.log(this)
    }

    Model.prototype = Event.prototype;
    Model.prototype.constructor = Model;

    Model.prototype.watch = function (key, handler) {
        if (!handler || typeof key === 'undefined') {
            return;
        };
        // 子代产生变化
        // 千万不要在这种回调里进行属性修改。
        this.on("valuechange", function (changekey, newval, oldval) {
            if (changekey === key && changekey in this) {
                var _this = this;
                nextTick(function () {
                    handler.call(_this, newval, oldval);
                });
            }else{
                return false;
            }
        });
    }
    Model.prototype.watchChild = function (key, handler) {
        if (!handler || !key) {
            return;
        };
        // 后代的value有变化(不含子代)-i.e.冒泡上来的事件
        // 冒泡上来的事件，不会有key,newval,oldval
        this.on("valuechange_descendant", function () {
            handler.call(this);
        })
    }


    function k () {
        Event.call(this);
    }
    k.prototype = Event.prototype;
    k.prototype.constructor = k;

    k.prototype.model = function (data, deep) {
        var _type = type(data);
        
        if (_type !== 'object') {
            return null;
        };

        return objectToModel(data, deep);
    }


    function objectToModel(obj, deep) {
        var keys = Object.keys(obj);
        var model = new Model();
        deep = type(deep) === 'boolean' ? deep : true;
        model._deep = deep;
        
        var _type;
        keys.forEach(function (key, ind) {
            var _type = type(obj[key]);

            if (_type === 'array' && deep) {
                model._data[key] = arrayToModel(obj[key], deep);
            }else if (_type === 'object' && deep) {
                model._data[key] = objectToModel(obj[key], deep);
            }else{
                model._data[key] = obj[key];
            }
            
            defineProperty(model, key);
            
        });

        _type = null;
        return model;
    }
    function arrayToModel(arr, deep) {
        var model = new Model();
        deep = type(deep) === 'boolean' ? deep : true;
        model._deep = deep;

        var _type;
        for (var i = 0; i < arr.length; i++) {
            _type = type(arr[i]);

            if (_type === 'array' && deep) {
                model._data[i] = arrayToModel(arr[i], deep);
            }else if (_type === 'object' && deep) {
                model._data[i] = objectToModel(arr[i], deep);
            }else{
                model._data[i] = arr[i];
            }

            defineProperty(model, i);
        };

        model.length = arr.length;
        model.splice = modelArray_splice;
        model.push = modelArray_push;
        model.unshift = modelArray_unshift;
        model.pop = modelArray_pop;
        model.shift = modelArray_shift;
        model.concat = modelArray_concat;

        return model;
    }

    /**
     * 数组方法
     */

    function modelArray_push () {
        var args = Array.prototype.slice.call(arguments, 0);
        if (args.length === 0) {
            return this.length;
        };
        for (var i = 0; i < args.length; i++) {
            this[this.length++] = args[i];
        };

        return this.length;
    }

    function modelArray_pop () {
        var len = this.length - 1;
        if (len < 0) {
            return;
        };
        var result = this[len];
        this[len] = null;
        delete this[len];
        this.length--;
        return result;
    }

    function modelArray_shift () {
        var len = this.length - 1;
        if (len < 0) {
            return;
        };
        var result = this[0];
        var len = this.length;
        for (var i = 0; i < len; i++) {
            this[i] = this[i + 1];
        };
        this.length--;
        return result;
    }

    function modelArray_unshift () {
        var args = Array.prototype.slice.call(arguments, 0);
        if (args.length === 0) {
            return this.length;
        };
        var len = this.length + args.length - 1;
        for (var i = len; i > 0; i--) {
            this[i] = this[i - args.length];
        };
        for (var i = 0; i < args.length; i++) {
            this[i] = args[i];
        };
        return this.length += args.length;
    }

    function modelArray_splice (index, howmany) {
        var model = this;
        var ret = new Model();
        ret.length = 0;
        index = index < 0 ? index + this.length : index;
        index = Math.max(index, 0);
        if (index > this.length - 1) {
            return ret;
        };
        var items = Array.prototype.slice.call(arguments, 3);
        howmany = (typeof howmany === 'number') ? howmany : model.length;
        howmany = Math.max(howmany, 0);
        // only need delete
        if (items.length === 0) {
            for (var i = index; i < model.length ; i++) {
                if(i < index + howmany){                // 删除区域
                    ret[i - index] = model[i];
                    ret.length = i - index + 1;
                }
                if (i >= model.length - howmany) {      // 多余区域
                    model[i] = null;
                    delete model[i];
                }else{                                  // 移动区域
                    model[i] = model[i + howmany];
                }
            };
        // need delete and add
        }else{
            var offset = items.length - howmany; // -1 0,1
            for (var i = model.length - howmany + items.length - 1; i >= index; i--) {
                if (i <= index - howmany + items.length) {  // 删除区域
                    ret[ret.length++] = model[i];
                    model[i] = items[i - index];
                }else{                                      // 移动区域
                    model[i] = model[i - offset];
                }
            };
        }
        model.length = model.length - howmany + items.length;
        
        return ret;
    }

    function modelArray_concat () {
        var args = Array.prototype.slice.call(arguments, 0);
        var ret = new Model();
        ret.length = 0;
        var len = this.length;
        var item;

        for (var i = 0; i < len; i++) {
            ret[i] = this[i];
        };
        ret.length = this.length;

        len = args.length;
        for (var i = 0; i < len; i++) {
            item = args[i];
            if (type(item) === 'array' || type(item) === 'model') {
                for (var j = 0; j < item.length; j++) {
                    ret[ret.length++] = item[j];
                };
            }else{
                ret[ret.length++] = item;
            }
            
        };
        return ret;
    }

    function defaultToModel(data) {
        var model = new Model();
        model._deep = false;
        
        model._data = data;
        defineProperty(model, key);

        return model;
    }

    function defineProperty(model, key) {
        var data = model._data;
        if (typeof key === 'undefined') {

        };

        Object.defineProperty(model, key, {
            configurable: true,
            get: function () {
                return data[key];
            },
            set: function (newval) {

                var oldval = data[key];
                var val;
                
                // 如果是数组或对象，则要转为model
                var _type = type(newval);
                if (_type === 'object') {
                    val = objectToModel(newval, !!oldval._type);
                }else if (_type === 'array') {
                    val = arrayToModel(newval, !!oldval._type);
                }else if(_type !== 'model'){
                    val = new Model();
                    val._deep = false;
                    val._data = newval;
                }

                // 事件回调内约定不要修改任何model的值，可以延迟修改
                var result = model.emit('valuechange', key, val, data[key]);

                if (result !== false) {
                    data[key] = val;
                };
            }
        });
    }

    win.k = k;
})(window || global || {});
