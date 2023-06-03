import Component from './Component.mjs';

export default class InputFile extends Component {
    constructor(props) {
        super(props);

        this.file = null;
        this.disabled = false;

        this._fileListener = void 0
        this._textListener = void 0
    }
    setFileListener = (listener) => {
        this._fileListener = listener
    }
    setTextListener = (textListener) => {
        this._textListener = textListener
    }
    async render(element) {
        await super.render(element);
        if (!this.props.hideTitle && (this.props.name || this.props.title)) {
            this.title = this.div('form-element-title');
            this.title.innerHTML = this.props.title || this.props.name;
        }
        this.dropBox = this.div('drop-box');
        this.dropBox.ondrop = this.dropHandler.bind(this);
        this.dropBox.ondragover = this.dragHandler.bind(this);
        this.dropBox.innerHTML = "<span class='icon icon-drop'></span>"
        this.input = document.createElement("input");
        this.input.type = "file"
        if (this.props.accept) {
            let val = Array.isArray(this.props.accept)?this.props.accept.join(','):this.props.accept;
            this.input.setAttribute('accept',val);
        }
        this.input.addEventListener('change', this.changeHandler)
        this.dropBox.onclick = this.clickHandler.bind(this);
        this.element.append(this.input);
    }
    dropHandler(event) {
        event.preventDefault();
        if(this.disabled) return;
        if(!event.dataTransfer) return;

        const {types} = event.dataTransfer

        if(types.includes("Files")) {
            this.file = event.dataTransfer.files[0]
            this.drawFile()
            if(this._fileListener) this._fileListener(this.file)
        } else if(types.includes("text/plain")) {
            const text = event.dataTransfer.getData("text/plain")

            if(this._textListener) this._textListener(text)
        }
    }
    changeHandler = (event) => {
        if(this.disabled) return;

        this.file = this.input.files[0];
        this.drawFile();
        if(this._fileListener) {
            this._fileListener(this.file)
        }
    }
    clickHandler(event) {
        this.input.click();
    }
    dragHandler(event) {
        event.preventDefault();
    }
    drawFile() {
        if (!this.file) return;

        let displayType = this.file.type.split('/')[0];
        if (displayType === 'image') {
            this.dropBox.innerHTML = '';
            let imagePreview = document.createElement('IMG');
            this.dropBox.append(imagePreview);
            const imageSrc = URL.createObjectURL(this.file)
            imagePreview.src = imageSrc;
        } else {
            let name = "<div class='file-name'>"+this.file.name+"</div>";
            let size = "<div class='file-size'>"+Math.round(this.file.size/100000)/10+"MB</div>";
            let type = "<div class='file-type'>"+this.file.type+"</div>";
            this.dropBox.innerHTML = "<div class='file-profile'>" + name + size + type + "</div>";
        }
    }
    drawLoader() {
        this.dropBox.innerHTML = "<div class='file-loader'></div>"
    }
    drawContent(content) {
        this.dropBox.innerHTML = '';
        if(content) {
            this.dropBox.append(content);
        } else {
            this.dropBox.innerHTML = "<span class='icon icon-drop'></span>"
        }
    }
    get value() {
        return this.file;
    }
}
