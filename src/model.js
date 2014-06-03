;(function (win) {
    
    function type (data) {
        var type = data instanceof Model ? "model" 
                    : Object.prototype.toString.call(data).slice(8, -1).toLowerCase();
        return type;
    }

    function nextTick (fn) {
        setTimeout(fn, 0);
    }

    function array_ensure (item) {
        if (this.indexOf(item) === -1) {
            this.push(item);
        };
        return this.length;
    }

    var modelKey = '__model_data__';
    function Event () {
        this[modelKey] = {};
    }
    Event.prototype.on = function (type, callback) {
        if (!this[modelKey]._events) {
            this[modelKey]._events = {};
        };

        var splitIndex = type.indexOf(":");
        var isPseudo = splitIndex !== -1 ? true : false;
        var realType = isPseudo ? type.slice(0, splitIndex) : type;

        if (!this[modelKey]._events[realType]) {
            this[modelKey]._events[realType] = [];
        };

        if (!this[modelKey]._events[type]) {
            this[modelKey]._events[type] = [];
        };

        if (isPseudo) {
            this[modelKey]._events[type].push(callback);
        }else{
            this[modelKey]._events[realType].push(callback);
        }
        
    }
    Event.prototype.off = function (type, callback) {
        if (this[modelKey]._events && 
            this[modelKey]._events[type]) {
            var index = this[modelKey]._events[type].indexOf(callback);
            this[modelKey]._events[type].splice(index, 1);
        };
    }
    Event.prototype.emit = function (type) {
        if (!this[modelKey]._events) {
            this[modelKey]._events = {};
        };
        var args = Array.prototype.slice.call(arguments, 1);
        var arr = this[modelKey]._events[type];

        if (!arr) {
            return;
        };

        for (var i = 0; i < arr.length; i++) {
            arr[i].apply(this, args);
        };
        this.emit.apply(this, [type + ":after"].concat(args));
    }
    
    Object.keys(Event.prototype).forEach(function (key) {
        Object.defineProperty(Event.prototype, key, {
            enumerable: false
        })
    });


    function Model () {
        Event.call(this);
        this[modelKey]._parentModel = null;
        this[modelKey]._parentModelKey = "";
        this[modelKey]._data = {};
        var _undefined;
        this[modelKey]._deep = _undefined;
        this[modelKey]._watchHanlders = [];
        this[modelKey]._subscribers = [];

        // 防止被误删、枚举、修改为其他数据.但本身内仍然允许修改
        Object.defineProperty(this, modelKey, {
            configurable: false,
            enumerable: false,
            writable: false
        });

        this.on("change:after", function () {
            if (this[modelKey]._parentModel) {
                this[modelKey]._parentModel.emit("childchange");
            };
        })

        this.on("childchange:after", function () {
            if (this[modelKey]._parentModel) {
                this[modelKey]._parentModel.emit("childchange");
            };
        })

        // 子代产生变化
        // 千万不要在这种回调里进行属性修改。
        this.on("valuechange", function () {
            console.log('valuechange',Array.prototype.slice.call(arguments))
            this.watchHandle.apply(this, Array.prototype.slice.call(arguments));
        })
    }

    Model.prototype = Object.create(Event.prototype);
    Model.prototype.constructor = Model;

    Model.prototype.watchHandle = function (changekey, newval, oldval) {
        
        if (changekey in this) {
            var _this = this;
            var watchHanlders = this[modelKey]._watchHanlders;
            for (var i = 0, handler; handler = watchHanlders[i++]; ) {
                if (handler.key === changekey) {
                    handler.handler.call(this, newval, oldval);
                };
            };
        }
    }
    // onchange, onchildchange
    Model.prototype.watch = function (key, handler) {
        if (!handler || typeof key === 'undefined') {
            return;
        };
        console.log('watch', key);
        key = key.toString();

        var watchHanlders = this[modelKey]._watchHanlders;
        for (var i = 0; i < watchHanlders.length; i++) {
            if (watchHanlders[i].handler === handler &&
                watchHanlders[i].key === key) {
                return;
            };
        };

        watchHanlders.push({
            key: key,
            handler: handler
        });
    }

    Model.prototype.unwatch = function (key, handler) {
        if (typeof key === 'undefined') {
            return;
        };
        console.log('unwatch', key);

        key = key.toString();

        var watchHanlders = this[modelKey]._watchHanlders;
        for (var i = 0; i < watchHanlders.length; i++) {
            if (watchHanlders[i].handler === handler && 
                watchHanlders[i].key === key) {
                this[modelKey]._watchHanlders.splice(i, 1);
                break;
            };
        };
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

    function ObjectModel () {
        Model.call(this);
    }

    ObjectModel.prototype = Object.create(Model.prototype);
    ObjectModel.prototype.constructor = ObjectModel;
    Object.keys(ObjectModel.prototype).forEach(function (key) {
        Object.defineProperty(ObjectModel.prototype, key, {
            enumerable: false
        })
    });

    function createObjectModel () {
        var o = Object.create(new ObjectModel());
        return o;
    }

    function createScope (parent, data) {
        var o = Object.create(parent || new ObjectModel());
        var keys = Object.keys(data);
        keys.forEach(function (key) {
            o[key] = data[key];
        });

    }

    function ArrayModel () {
        Model.call(this);
        Object.defineProperty(this, "length", {
            value: 0,
            configurable: false,
            enumerable: false,
            writable: true
        });
    }

    ArrayModel.prototype = Model.prototype;
    ArrayModel.prototype.constructor = ArrayModel;

    ArrayModel.prototype.splice = function (index, howmany) {
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

    ArrayModel.prototype.push = function () {
        var args = Array.prototype.slice.call(arguments, 0);

        args = args.map(function (arg) {
            return avalon.model(arg);
        });

        var len = this.length;

        for (var i = 0; i < args.length; i++) {
            this[modelKey]._data[i + len] = args[i];
            defineProperty(this, i + len + "");
        };

        Array.prototype.push.apply(this, args);

        this.emit('change');

        len = this.length;
        notifySubscriber(this, 'add', len - args.length, args);

        return len;
        // var args = Array.prototype.slice.call(arguments, 0);
        // if (args.length === 0) {
        //     return this.length;
        // };
        // for (var i = 0; i < args.length; i++) {
        //     this[this.length++] = args[i];
        // };
        // // 现在先触发change，实际上应该是property_add，不需要newval&oldval
        // this.emit("change");

        // return this.length;
    }

    ArrayModel.prototype.pop = function () {
        var len = this.length - 1;
        if (len < 0) {
            return;
        };
        var result = this[len];
        this[len] = null;
        delete this[len];
        this.length--;

        this.emit("change");
        return result;
    }

    ArrayModel.prototype.shift = function () {
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

        this.emit("change");
        return result;
    }

    ArrayModel.prototype.unshift = function () {
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

        this.length += args.length;
        this.emit("change");
        return this.length;
    }

    ArrayModel.prototype.concat = function () {
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

        this.emit("change");
        return ret;
    }

    Object.keys(ArrayModel.prototype).forEach(function (key) {
        Object.defineProperty(ArrayModel.prototype, key, {
            enumerable: false
        })
    });
    

    function k () {
        Event.call(this);
    }
    k.prototype = new Event();
    k.prototype.constructor = k;

    k.prototype.model = function (data, deep) {
        var _type = type(data);
        
        if (_type !== 'object') {
            return null;
        };

        return objectToModel(data, deep);
    }

    k.prototype.parseHTML = parseHTML;

    // data会生成一个scope|model
    k.prototype.view = function (tpl, scopes) {
        return new View(tpl, scopes);
    }

    function View (tpl, scopes) {
        if (type(scopes) === 'model') {
            scopes = [scopes];
        };
        this.dom = parseHTML(tpl);
        scanTag(this.dom, scopes);
    }

    View.prototype.appendTo = function (wrap) {
        wrap.appendChild(this.dom);
    }

    function parseHTML(tpl) {
        var fragment = document.createDocumentFragment();
        var div = document.createElement('div');
        div.innerHTML = tpl;

        while(div.firstChild){
            fragment.appendChild(div.firstChild);
        }
        div = null;

        return fragment;
    }    

    function objectToModel(obj, deep) {
        var keys = Object.keys(obj);
        var model = createObjectModel();
        deep = type(deep) === 'boolean' ? deep : true;
        model[modelKey]._deep = deep;
        
        var _type;
        keys.forEach(function (key, ind) {
            var _type = type(obj[key]);

            if (_type === 'array' && deep) {
                model[modelKey]._data[key] = arrayToModel(obj[key], deep);
                model[modelKey]._data[key][modelKey]._parentModel = model;
            }else if (_type === 'object' && deep) {
                model[modelKey]._data[key] = objectToModel(obj[key], deep);
                model[modelKey]._data[key][modelKey]._parentModel = model;
            }else if (_type === 'model') {
                // 已经是model，不做处理
                return;
            }else{
                model[modelKey]._data[key] = obj[key];
            }
            
            defineProperty(model, key);
            
        });

        _type = null;
        return model;
    }

    function arrayToModel(arr, deep) {
        var model = new ArrayModel();
        deep = type(deep) === 'boolean' ? deep : true;
        model[modelKey]._deep = deep;

        var _type;
        for (var i = 0; i < arr.length; i++) {
            _type = type(arr[i]);

            if (_type === 'array' && deep) {
                model[modelKey]._data[i] = arrayToModel(arr[i], deep);
                model[modelKey]._data[i][modelKey]._parentModel = model;
            }else if (_type === 'object' && deep) {
                model[modelKey]._data[i] = objectToModel(arr[i], deep);
                model[modelKey]._data[i][modelKey]._parentModel = model;
            }else if (_type === 'model') {
                // 已经是model，不做处理
                return;
            }else{
                model[modelKey]._data[i] = arr[i];
            }

            // +""很重要，一定要保证key统一是字符串
            defineProperty(model, i + "");
        };
        model.length = arr.length;

        return model;
    }

    function defineProperty(model, key) {
        var data = model[modelKey]._data;
        if (typeof key === 'undefined') {

        };

        function accesser () {
            // get
            if (arguments.length === 0) {
                if (avalon.isCollecting && Subscriber) {
                    array_ensure.call(accesser.subscribers, Subscriber);
                };
                return data[key];
            }else{
                var newval = arguments[0];
                var oldval = data[key];
                // 相同值无视
                if (newval === oldval) {
                    return;
                };

                var val;
                
                // 如果是数组或对象，则要转为model
                var _type = type(newval);
                if (_type === 'object') {
                    val = objectToModel(newval, oldval[modelKey]._deep);
                }else if (_type === 'array') {
                    val = arrayToModel(newval, oldval[modelKey]._deep);
                }else if(_type !== 'model'){
                    // val = new Model();
                    // val._deep = false;
                    // val._data = newval;
                    val = newval;
                }

                if (type(val) === 'model') {
                    val[modelKey]._parentModel = data[key][modelKey]._parentModel;
                    val[modelKey]._events = data[key][modelKey]._events;
                };

                // 事件回调内约定不要修改任何model的值，可以延迟修改
                nextTick(function () {
                    notifySubscriber(accesser);

                    model.emit('valuechange', key, val, data[key]);
                    if (type(val) === 'model') {
                        val.emit("change", val, data[key]);
                    }else{
                        model.emit('change', key, val, data[key]);
                    }
                    
                });
                data[key] = val;
            }
        }

        accesser.subscribers = [];

        Object.defineProperty(model, key, {
            configurable: true,
            get: accesser,
            set: accesser
        });
    }

    win.avalon = new k();
    avalon.scanTag = scanTag;
    avalon.type = type;


    /**
     * 扫描模板部分
     */
    var prefix = "ms-";
    // 扫描标签-1属性2文本3子标签
    function scanTag (elem, scopes) {
        // ms-controller
        if (elem.nodeType === 1) {
            scanAttr(elem, scopes);
        };

        var childs = elem.childNodes;
        for (var i = 0; i < childs.length; i++) {
            switch (childs[i].nodeType){
                case 1: 
                    scanTag(childs[i], scopes);
                    break;
                case 3: 
                    if (rexpr.test(childs[i].nodeValue)) {
                        scanText(childs[i], scopes);
                    };
                    break;
            }
        };
        
    }

    var rexpr = new RegExp("{{(.*?)}}");
    // 扫描文本
    function scanText (node, scopes) {
        var text = node.nodeValue;
        var tokens = scanExpr(text);

        var bindings = [];
        var fragment = document.createDocumentFragment();
        tokens.forEach(function (token) {
            var newnode = document.createTextNode(token.value);
            if (token.expr) {
                var filters = token.filters;
                var binding = {
                    type: "text",
                    node: newnode,
                    nodeType: 3,
                    value: token.value
                }

                if (filters && filters.indexOf("html") !== -1) {
                    filters.splice(filters.indexOf("html"), 1);
                    binding.type = "html"
                    binding.replaceNodes = [newnode];
                }

                bindings.push(binding);
            };
            fragment.appendChild(newnode);
        });

        node.parentNode.replaceChild(fragment, node);
        executeBindings(bindings, scopes);
    }

    var rmsAttr = new RegExp(prefix + '(\\w+)-?(.*)', '');

    // 扫描指定标签身上的所有节点
    function scanAttr (elem, scopes) {
        var attributes = elem.attributes;
        var attr, match;
        var bindings = [];
        for (var i = 0; i < attributes.length; i++) {
            attr = attributes[i];
            if (attr.specified) {
                match = attr.name.match(rmsAttr);
                if (match) {
                    var type = match[1];
                    var param = match[2] || '';

                    var binding = {
                        type: type,
                        param: param,
                        element: elem,
                        name: match[0],
                        value: attr.value
                    };

                    if (type === 'repeat') {
                        // 防止重复解析repeat
                        elem.removeAttribute(binding.name);
                        binding.element = null;
                        binding.tpl = parseHTML(elem.outerHTML);
                        binding.replaceNodes = [elem];
                        // 只有repeat为binding加上scope
                        binding.scopes = scopes;
                        // 重要，阻止scanTag扫描内部
                        elem.innerHTML = '';
                    };

                    bindings.push(binding);
                };

                
            };
        };   

        executeBindings(bindings, scopes);
    }

    var rfilters = /\|\s*(\w+)\s*(\([^)]*\))?/g,
            r11a = /\|\|/g,
            r11b = /U2hvcnRDaXJjdWl0/g,
            rlt = /&lt;/g,
            rgt = /&gt;/g;

    function scanExpr (str) {
        var ret = [];
        var start = 0;
        var stop,value;
        do{
            stop = str.indexOf("{{", start);
            if (stop === -1) {
                break;
            };
            // {{ 左侧的文本
            value = str.slice(start, stop);
            if (value) {
                ret.push({
                    value: value,
                    expr: false
                });
            };
                
            // {{ 中间的文本}}
            start = stop + 2;
            stop = str.indexOf("}}", start);
            if (stop === -1) {
                break;
            };
            value = str.slice(start, stop);
            if (value) {
                var leach = [];
                if (value.indexOf("|") > 0) { // 抽取过滤器 先替换掉所有短路与
                    value = value.replace(r11a, "U2hvcnRDaXJjdWl0") //btoa("ShortCircuit")
                    value = value.replace(rfilters, function(c, d, e) {
                        leach.push(d + (e || ""))
                        return ""
                    })
                    value = value.replace(r11b, "||") //还原短路与
                }

                ret.push({
                    value: value,
                    expr: true,
                    filters: leach.length ? leach : void 0
                });
            };
            start = stop + 2;

        }while(1)
        
        // }} 右侧的文本
        value = str.slice(start);
        if (value) {
            ret.push({
                value: value,
                expr: false
            });
        };

        return ret;

    }

    function noop () {}

    // 处理多个表达式与单一表达式 => 对应唯一的binding上的问题
    function parseExprProxy (code, scopes, binding, tokens) {
        // 多个表达式如'a {{b}} c';
        if (Array.isArray(tokens)) {
            tokens = tokens.map(function (token) {
                var tmpl = {};
                if (token.expr) {
                    tmpl.evaluator = parseExpr(token.value, scopes, tmpl) ;
                    return tmpl;
                }else{
                    return token.value;
                }
            });

            binding.evaluator = function () {
                var ret = '';
                tokens.forEach(function (token) {
                    ret += typeof token === 'string' ? token :
                           token.evaluator.apply(0, token.args);
                });
                return ret;
            }
            binding.args = [];
        // 单一表达式如'a',类似'{{a}}'如ms-click='a()'
        }else{
            binding.evaluator = parseExpr(code, scopes, binding);
        }
    }

    var rdash = /\(([^)]*)\)/;
    var revent = /([\s,]|^)\$event([\s,]|$)/;

    // 取得求值函数
    // 暂不考虑安全性
    // key里只准有字母、数字、下划线
    // data用来挂上实参
    // expr只能是表达式，或带引号的字符串。如{{a}}内的a或者'b'，不能是{{a}}传b,否则err
    // onclick(scope,$event)注意顺序
    function parseExpr (expr, scopes, data) {
        var vars = getIdent(expr);
        var declare = [];
        vars.forEach(function (ident, ind) {
            for (var i = 0; i < scopes.length; i++) {
                if (scopes[i].hasOwnProperty(ident)) {
                    scope = scopes[i];
                    break;
                };
            };
            if (!(i < scopes.length)) {
                return;
            };
            declare.push(ident + "=vm_aabbccdd_scope_"+i+"['" + ident + "']");
        });

        // 形参
        var args = [];
        for (var i = 0; i < scopes.length; i++) {
            args.push("vm_aabbccdd_scope_" + i);
        };

        // evaluator的实参，目前只有scope
        data.args = !!data.args ? data.args : [];

        if (data.type === 'on') {
            // var params = expr.match(rdash);
            // if (params) {
            //     if (revent.test(params[1])) {
            //         declare.push(params[1].replace(revent, "$1vm_aabbccdd_event$2"));
            //     };
            // };

            var code = declare.length ? "var " + declare.join(",") + ";\r\n" : "";
            var split = "{empty" + Date.now() + "}";
            code += split + "return " + expr + ";";
            var headerIndex = code.indexOf(split);
            var header = code.slice(0, headerIndex);
            var footer = code.slice(headerIndex + split.length);
            code = header + ";if(avalon.isCollecting){return ;};" + footer;
            
        }else if(data.type === 'repeat'){
            args.push("$index");
            var code = declare.length ? "var " + declare.join(",") + ";\r\n" : "";
            code += 'var retaabbccdd=' + expr + ';\r\n';
            code += "return retaabbccdd";
        }else{
            var code = declare.length ? "var " + declare.join(",") + ";\r\n" : "";
            code += 'var retaabbccdd=' + expr + ';\r\n';
            code += "return retaabbccdd";
        }
        
        data.args = scopes.concat(data.args);

        try {
            var fn = Function.apply(noop, args.concat(code));
        }catch(err){
            console.error("parseExpr:求值函数生成失败。code:" + code + "",err);
        }
        return fn;
    }

    // 获取需要用到的第一层属性
    var keywords =
            // 关键字
            "break,case,catch,continue,debugger,default,delete,do,else,false" + ",finally,for,function,if,in,instanceof,new,null,return,switch,this" + ",throw,true,try,typeof,var,void,while,with"
            // 保留字
            + ",abstract,boolean,byte,char,class,const,double,enum,export,extends" + ",final,float,goto,implements,import,int,interface,long,native" + ",package,private,protected,public,short,static,super,synchronized" + ",throws,transient,volatile"

            // ECMA 5 - use strict
            + ",arguments,let,yield"

            + ",undefined"
    var rrexpstr = /\/\*(?:.|\n)*?\*\/|\/\/[^\n]*\n|\/\/[^\n]*$|'[^']*'|"[^"]*"|[\s\t\n]*\.[\s\t\n]*[$\w\.]+/g
    var rsplit = /[^\w$]+/g
    var rkeywords = new RegExp(["\\b" + keywords.replace(/,/g, '\\b|\\b') + "\\b"].join('|'), 'g')
    var rnumber = /\b\d[^,]*/g
    var rcomma = /^,+|,+$/g
    function getIdent(code) {
        code = code
                .replace(rrexpstr, "")
                .replace(rsplit, ",")
                .replace(rkeywords, "")
                .replace(rnumber, "")
                .replace(rcomma, "")

        return code ? code.split(/,+/) : []
    }

    avalon.isCollecting = false;
    var Subscriber;
    // 为bindings算出求职函数，此前从elem分析出了bindings，引用了elem,
    // 现在再从bindings的value求出求值函数，最后再执行求职函数，把用到的
    // scope属性全都订阅一份，建立起联系。elem>bindings.scope>bindings
    // 这个函数只有在第一次解析的时候，会执行一次。
    function executeBindings (bindings, scopes) {
        // 为所有binding解析求值函数
        bindings.forEach(function (binding) {
            // 首次解析的预处理
            bindingHandlers[binding.type](binding, scopes);
            
            // 为不同类型的绑定在执行不同的回调
            binding.handler = bindingExecutors[binding.type];
            // binding.handler()
        });
        

        // 执行一下所有求值函数，将binding加入scope的订阅列表
        // 这种方式不能完整得到 流程控制如if-else下函数对scope的各属性依赖
        // 不过本身view层就要求没有流程控制，只有精简的表达式，所以没问题
        avalon.isCollecting = true;
        bindings.forEach(function (binding) {
            if (binding.evaluator) {
                Subscriber = binding;
                binding.evaluator.apply(binding, scopes);
                Subscriber = null;
            };
            if (binding.element) {
                binding.element.removeAttribute(binding.name);
            };
        })
        avalon.isCollecting = false;

    }

    // 只有第一次解析的时候执行
    var bindingHandlers = {
        "class" : function (binding, scopes) {
            // 可能解析出多个表达式如"a{{b}}c"
            // 下面代码可能多次出现，需要放在单独的函数里
            parseExprProxy(binding.value, scopes, binding, scanExpr(binding.value));
            var elem = binding.element;
            elem.className = binding.evaluator.apply(binding, binding.args || []);
        },
        "attr" : function (binding, scopes) {
            // 可能解析出多个表达式如"a{{b}}c"
            // 下面代码可能多次出现，需要放在单独的函数里
            parseExprProxy(binding.value, scopes, binding, scanExpr(binding.value));

            var elem = binding.element;
            elem.setAttribute(binding.param, binding.evaluator(binding.args || []));
        },
        "on" : function (binding,scopes) {
            parseExprProxy(binding.value,scopes, binding);
            var elem = binding.element;

            if (binding.param === 'tap') {
                elem.addEventListener("ms_tap" ,function (ev) {
                    nextTick(function () {
                        binding.evaluator.apply(elem, binding.args || []);
                    });
                }, false);
            }else{
                elem.addEventListener(binding.param, function () {
                    binding.evaluator.apply(elem, binding.args || []);
                }, false);
            }
        },
        "id" : function (binding, scopes) {
            parseExprProxy(binding.value, scopes, binding, scanExpr(binding.value));
            var elem = binding.element;
            elem.id = binding.evaluator.apply(binding, binding.args || []);
        },
        "text" : function (binding, scopes) {
            parseExprProxy(binding.value,scopes, binding);
            binding.node.nodeValue = binding.evaluator.apply(binding, binding.args || []);
        },
        "html" : function (binding, scopes) {
            parseExprProxy(binding.value,scopes, binding);
            bindingExecutors.html(binding.value, binding.node, binding);
            
        },
        "repeat": function (binding, scopes) {
            var arr = null;
            var scope = null;
            var scopeIndex = -1;

            var code = 'try {' +
                            'return scope. ' + binding.value +
                        '}catch(err){console.log(scope)};' +
                        'return token';
            var token = {};

            var hasRepeatScope = Function.apply(noop, 
                                     ['scope', 'token',code]);



            // 得到求职函数中会调用的scope
            for (var i = 0; i < scopes.length; i++) {
                
                if ((arr = hasRepeatScope(scopes[i], token)) !== token) {
                    scope = scopes[i];
                    scopeIndex = i;
                    break;
                }else{
                    arr = null;
                }
            };
            
            if (!arr) {
                return;
            };

            // 让Subscriber订阅scope
            array_ensure.call(
                    arr[modelKey]._subscribers, 
                    binding);

            binding.evaluator = function () {
                var scopes = Array.prototype.slice.call(arguments);
                for (var i = 0; i < scopes.length; i++) {
                    if (scopes[i].hasOwnProperty(this.value)) {
                        return scopes[i];
                    };
                };

                return null;
            }

            // 数组项目被重新赋值，会触发binding.handler
            avalon.isCollecting = true;
            Subscriber = binding;
            scope[binding.value];
            Subscriber = null;
            avalon.isCollecting = false;
            
            // 
            var fragment = document.createDocumentFragment();
            for (var i = 0; i < arr.length; i++) {
                fragment.appendChild(parseRepeat(arr, i, binding, scopes));
            };
            
            var repNodes = binding.replaceNodes;
            binding.replaceNodes = Array.prototype.slice.call(fragment.childNodes);

            repNodes[0].parentNode.replaceChild(
                    fragment,
                    repNodes[0]
            );

            for (var i = 1; i < repNodes.length; i++) {
                repNodes[i].parentNode.removeChild(repNodes[i]);
            };

            repNodes = null;
        }
    }

    function getRepeatScope (scope, value) {
        return scope.elem.childs;
    }

    // 为repeat的每一项生成view
    function parseRepeat (arr, i, binding, scopes) {
        var view = null;
        var key = binding.param || "item";
        var tpl = binding.tpl;
        
        avalon.isCollecting = true;
        // var elem = avalon.view(tpl, scopes).dom;
        // fragment.appendChild(elem)
        // 为repeat创建一个scope，便于特有标识符使用，只读不会被写
        var repeatParam = {
            $index: i
        }
        repeatParam[key] = Object.create(arr[i]);
        repeatParam[key].$index = i; // 为了多层循环能访问祖级$index


        // 收集内部的依赖
        view = tpl.cloneNode(true);
        scanTag(view, [repeatParam].concat(scopes));
        view = view.firstChild;

        // 当arr[i]被重新赋值
        function watchItem (oldParam, oldView, ind) {
            console.log('watchItem',ind,binding.value)
            arr.watch(ind, rescan);

            var lastval = null;
            function rescan(newval) {
                console.log('rescan',ind)
                
                if (lastval === newval) {
                    console.log("阻止")
                    return;
                };
                lastval = newval;

                // 重新解析，插入到dom中
                var newelem = tpl.cloneNode(true);
                var newParam = {
                    $index : oldParam.$index
                }
                newParam[key] = newval;

                // 重新收集依赖 TODO 老依赖需要释放
                avalon.isCollecting = true;
                scanTag(newelem, [newParam].concat(scopes));
                avalon.isCollecting = false;

                newelem = newelem.firstChild;
                
                if (oldView.parentNode) {
                    oldView.parentNode.replaceChild(
                            newelem,
                            oldView
                    );
                };

                /**
                 * 一定要延迟执行
                 * 不然会无限死循环：
                 *     触发修改事件、批量循环
                 *         unwatch
                 *         执行watchItem
                 *         watch
                 *         修改事件触发中
                 *         unwatch
                 *         执行watchItem
                 *         watch
                 *         .....
                 */
                // nextTick(function () {
                    console.log('rescanover',ind)
                    arr.unwatch(ind, rescan);
                    watchItem(newParam, newelem, newParam.$index);
                // });
                
                // 释放
                oldParam = oldView = null;
            }
        }

        watchItem(repeatParam, view, i);
        
        return view;
    }



    // 订阅scope，将数据反映在HTML上
    var bindingExecutors = {
        "class" : function (val, elem, binding) {
            elem.className = val;
        },
        "attr" : function (val, elem, binding) {
            elem.setAttribute(binding.param, val);
        },
        "click" : function (binding,scope) {

        },
        "id" : function (val, elem, binding) {
            elem.id = val;
        },
        "text" : function (val, elem, binding) {
            binding.node.nodeValue = val;
        },
        "html" : function (val, elem, binding) {
            var elem = binding.node.parentNode;

            var div = document.createElement("div");
            div.innerHTML = binding.evaluator.apply(binding, binding.args || []);
            var fragment = document.createDocumentFragment();
            while(div.firstChild){
                fragment.appendChild(div.firstChild);
            }
            div = null;

            var replaceNodes = Array.prototype.slice.call(fragment.childNodes);
            elem.insertBefore(fragment, binding.replaceNodes[0]);
            for (var i = 0, node; node = binding.replaceNodes[i++]; ) {
                elem.removeChild(node)
            }

            binding.replaceNodes = replaceNodes;

            // 第一次解析时，扫描一下.再次赋值时，扫描一下;TODO scope 
            var node, scope = binding.args[0];
            for (var i = 0; i < binding.replaceNodes.length; i++) {
                node = binding.replaceNodes[i];
                if (node.nodeType === 1) {
                    scanTag(node, scope);
                };
                if (node.nodeType === 3) {
                    scanText(node, scope);
                };
            };
        },
        "repeat" : function (action, elems, binding) {
            var pos, items, arr;
            var args = Array.prototype.slice.call(arguments);
            switch (action){
                case "refresh":
                    // 整个标签都删掉，重新渲染。
                    // 1.生成新的标签
                    
                    for (var i = 0; i < elems.length; i++) {
                        elems[i].parentNode.removeChild(
                                elems[i]);
                    };
                    break;
                case 'clear':
                    for (var i = 0; i < elems.length; i++) {
                        elems[i].parentNode.removeChild(
                                elems[i]);
                    };
                    break;
                case 'add':
                    binding = this;
                    pos = args[1];
                    items = args[2];
                    arr = args[3];
                    // 位置不对
                    if (pos > this.replaceNodes.length) {
                        console.warn("pos不对，可能有潜在错误.");
                        return;
                    }

                    var fragment = document.createDocumentFragment();
                    for (var i = pos; i < items.length + pos; i++) {
                        fragment.appendChild(
                            parseRepeat(arr, pos, binding, binding.scopes)
                        );
                    };
                    
                    var repNodes = Array.prototype.slice.call(fragment.childNodes);

                    this.replaceNodes[0].parentNode.appendChild(
                        fragment
                    );

                    this.replaceNodes = this.replaceNodes.concat(
                        repNodes
                    );
                    break;
                default:
                    console.log(arguments)
                    break;
            }
        }
    }
    
    // 通知 订阅者更新自己
    function notifySubscriber (accesser) {
        var isModel = accesser instanceof Model;
        if (isModel) {
            var subscribers = accesser[modelKey]._subscribers;
        }else{
            var subscribers = accesser.subscribers;
        }

        if (subscribers && subscribers.length) {
            var args = Array.prototype.slice.call(arguments, 1);
            subscribers.forEach(function (subscriber) {
                // 默认所有订阅者都是binding对象,暂不考虑其他情况
                switch(subscriber.type){
                    case 'on': 
                        break;
                    case 'repeat': 
                        // 由访问器触发,如obj.arr = [1,2]产生重新赋值
                        if (!isModel) {     // 由访问器触发
                            var val = subscriber.evaluator();
                            // 变为非数组
                            if (!(val instanceof ArrayModel)) {
                                subscriber.handler("clear", 
                                        subscriber.replaceNodes,
                                        subscriber);
                            }else{
                                subscriber.handler("refresh", 
                                        subscriber.replaceNodes,
                                        subscriber);
                            }
                        // 由ArrayModel函数触发，主要是增删.
                        // 子元素重新赋值在bindingHandlers已经处理
                        }else{
                            subscriber.handler.apply(subscriber,
                                args.concat(accesser));
                        }

                        break;
                    default:
                        var val = subscriber.evaluator.
                                  apply(0, subscriber.args || []);
                        subscriber.handler(
                                val, subscriber.replaceNodes, subscriber);
                        break;
                }
            })
        };
    }



    /******************************************************
     *
     * tap事件
     *
     ******************************************************/
    function Tap(el) {
        el = typeof el === 'object' ? el : document.getElementById(el);
        this.element = el;
        this.moved = false; //flags if the finger has moved
        this.startX = 0; //starting x coordinate
        this.startY = 0; //starting y coordinate
        this.hasTouchEventOccured = false; //flag touch event
        el.addEventListener('touchstart', this, false);
        el.addEventListener('touchmove', this, false);
        el.addEventListener('touchend', this, false);
        el.addEventListener('touchcancel', this, false);
        el.addEventListener('mousedown', this, false);
        el.addEventListener('mouseup', this, false);
    }

    Tap.prototype.start = function (e) {
        if (e.type === 'touchstart') {
            this.hasTouchEventOccured = true;
        }
        this.moved = false;
        this.startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        this.startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
    };

    Tap.prototype.move = function (e) {
        //if finger moves more than 10px flag to cancel
        if (Math.abs(e.touches[0].clientX - this.startX) > 10 || Math.abs(e.touches[0].clientY - this.startY) > 10) {
            this.moved = true;
        }
    };

    Tap.prototype.end = function (e) {
        var evt;

        if (this.hasTouchEventOccured && e.type === 'mouseup') {
            e.preventDefault();
            e.stopPropagation();
            this.hasTouchEventOccured = false;
            return;
        }

        if (!this.moved) {
            //create custom event
            if (typeof document.CustomEvent !== "undefined") {
                evt = new document.CustomEvent('ms_tap', {
                    bubbles: true,
                    cancelable: true
                });
            } else {
                evt = document.createEvent('Event');
                evt.initEvent('ms_tap', true, true);
            }
            e.target.dispatchEvent(evt);
        }
    };

    Tap.prototype.cancel = function (e) {
        this.hasTouchEventOccured = false;
        this.moved = false;
        this.startX = 0;
        this.startY = 0;
    };

    Tap.prototype.destroy = function () {
        var el = this.element;
        el.removeEventListener('touchstart', this, false);
        el.removeEventListener('touchmove', this, false);
        el.removeEventListener('touchend', this, false);
        el.removeEventListener('touchcancel', this, false);
        el.removeEventListener('mousedown', this, false);
        el.removeEventListener('mouseup', this, false);
        this.element = null;
    };

    Tap.prototype.handleEvent = function (e) {
        switch (e.type) {
        case 'touchstart': this.start(e); break;
        case 'touchmove': this.move(e); break;
        case 'touchend': this.end(e); break;
        case 'touchcancel': this.cancel(e); break;
        case 'mousedown': this.start(e); break;
        case 'mouseup': this.end(e); break;
        }
    };

    new Tap(document);
})(window || global || {});