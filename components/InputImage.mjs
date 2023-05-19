import Component from "./Component.mjs";

export default class InputImage extends Component {
  constructor(props) {
    super(props);
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
    this.imagePreview = document.createElement('IMG');
    this.imagePreview.classList.add('image-preview');
    this.dropBox.append(this.imagePreview);
    this.input = document.createElement("input");
    this.input.type = "file"
    if (this.props.accept) {
      let val = Array.isArray(this.props.accept)?this.props.accept.join(','):this.props.accept;
      this.input.setAttribute('accept',val);
    }
    this.dropBox.onclick = this.clickHandler.bind(this);
    this.element.append(this.input);
  }
  dropHandler(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      this.file = event.dataTransfer.files[0];
      this.drawFile();
    }
  }
  clickHandler(event) {
    this.input.click();
    this.input.addEventListener('change',(event)=>{
      this.file = this.input.files[0];
      this.drawFile();
    })
  }
  dragHandler(event) {
    event.preventDefault();
  }
  drawFile() {
    const imageSrc = URL.createObjectURL(this.file)
    this.imagePreview.src = imageSrc;
  }
  get value() {
    return this.input.files[0];
  }
}
