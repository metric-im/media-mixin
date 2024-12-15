import Component from './Component.mjs';
import {Button} from './Button.mjs';
import IdForge from './IdForge.mjs';
import API from './API.mjs';
import {InputSelect} from './InputSelect.mjs';
import {InputText} from './InputText.mjs'
import MediaPresets from './MediaPresets.mjs'
import ToolTip from "./ToolTip.mjs";
import ImageEditor from "./ImageEditor.mjs";

export default class InputMultipleImages extends Component {
  constructor(props) {
    super(props);
    this.server = "aws";
    this.scale = parseInt(window.localStorage.getItem('scale')) || 8;

  }
  async render(element) {
    await super.render(element);
    await this.load();

    this.content = this.div('page-content');
    this.controls = this.div('page-controls');
    this.itemControls = this.div('item-controls',this.controls);

    this.dropBox = this.div('drop-box',this.content);
    this.dropBox.ondrop = this.dropHandler.bind(this);
    this.dropBox.ondragover = this.dragHandler.bind(this);
    this.dropBox.onclick = await this.clickHandler.bind(this);
    this.dropBox.onwheel = await this.wheelHandler.bind(this);
    for (let key of Object.keys(this.images)) this.dropBox.append(this.createIcon(this.images[key]._id));
    this.toolTip = await this.draw(ToolTip,{text:"Drop images. Ctrl-wheel to zoom. Click for details"},this.dropBox);
    this.itemProperties = this.div('item-properties',this.content);
  }
  createIcon(id) {
    let img = document.createElement('img');
    img.src = `media/image/id/${id}.icon`;
    img.id = id;
    img.classList.add("fixed");
    img.style.width = `${this.scale}%`;
    return img;
  }
  async load() {
    this.images = await API.get('/media/image/list/'+this.props.context.id);
  }
  async dropHandler(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      for (let file of event.dataTransfer.files) {
        let container = this.div('upload-container',this.dropBox)
        container.job = new Job(this,container,file);
        await container.job.stage();
      }
    }
  }
  async clickHandler(event) {
    if (event.target.nodeName !== 'IMG') return;
    await this.renderProperties(event.target.id);
  }
  async renderProperties(id) {
    this.itemProperties.innerHTML = '';
    let detailsContainer = this.div('properties-details-container',this.itemProperties);
    detailsContainer.innerHTML = `<h3>${id}</h3>`;
    let presetOptions = Object.values(MediaPresets).map(o => {return {name:o.name,value:o._id}});
    presetOptions.unshift({name:'',value:''});
    let preset = await this.draw(InputSelect,{name:'preset',options:presetOptions},detailsContainer);
    preset.element.addEventListener('change',(e)=>{
      img.src = `media/image/id/${id}.${preset.value}`;
    })
    let scale = await this.draw(InputText,{name:'scale',title:'scale X,Y (pixels)'},detailsContainer);
    let crop = await this.draw(InputText,{name:'crop',title:'crop X,Y,H,W (ratio 0 to 1)'},detailsContainer);
    let imageContainer = this.div('properties-image-container',this.itemProperties);
    this.imageEditor = await this.draw(ImageEditor,{id:id,context:this.props.context},imageContainer);
    this.itemControls.innerHTML = '';
    await this.draw(Button,{name:'rotate',title:'Rotate'},this.itemControls);
    await this.draw(Button,{name:'delete',title:'Delete',icon:'trash',onClick:async ()=>{
        if (await window.toast.prompt('Confirm delete of '+id)) {
          await API.remove(`/media/image/${id}`);
          await this.render();
        }
      }},this.itemControls);
  }
  async handleUpdate(attributeName) {
    await super.handleUpdate(attributeName);
    if (attributeName === 'preset') {

    } else if (attributeName === 'scale') {

    } else if (attributeName === 'crop') {

    }
  }
  dragHandler(event) {
    event.preventDefault();
  }
  wheelHandler(event) {
    if (event.ctrlKey) {
      event.preventDefault();
      if (!this.scale) this.scale = 8;
      this.scale += event.deltaY>0?-1:1;
      if (this.scale > 24) this.scale = 24;
      if (this.scale < 2) this.scale = 2;
      this.dropBox.querySelectorAll('img').forEach((elem)=>{
        elem.style.width = `${this.scale}%`;
      })
      if (this.dropBox.scrollHeight > this.dropBox.clientHeight) {
        this.toolTip.element.classList.add('hidden');
      } else {
        this.toolTip.element.classList.remove('hidden');
      }
      window.localStorage.setItem('scale', this.scale.toString());
    }
  }
}

class Job {
  constructor(parent,element,file) {
    this.parent = parent;
    this.element = element;
    this.file = file;
    this.status = Job.NEW;
    this.id = this.parent.props.context.id+'/'+IdForge.datedId();
    this.img = document.createElement('img');
    this.img.src = URL.createObjectURL(this.file);
    this.img.style.clipPath = "circle(0%)";
    this.element.append(this.img);
  }
  static NEW = 1;
  static UPLOAD = 2;
  static FAILED = 3;
  static SUCCESS = 4;
  static COMPLETE = 5;

  /**
   * An upload is first staged to declare the metadata and track progress.
   * @returns {Promise<void>}
   */
  async stage() {
    let body = {
      _id:this.id,
      type: this.file.type,
      size: this.file.size,
      captured: this.file.lastModified
    }
    let options = {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    };
    let response = await fetch(`/media/stage/${this.parent.server}`, options);
    let result = await response.json();
    if (response.ok) {
      this.status = Job.UPLOAD;
      await this.upload(result);
    } else {
      this.status = Job.FAILED;
      window.toast.error("something went wrong: " + result.message);
    }
  }

  async upload(stageResult) {
    try {
      let formData = new FormData();
      formData.append('file',this.file);

      let xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        let progress = ((e.loaded / e.total) * 100);
        this.element.style.clipPath = `circle(${progress}%)`;
      };
      xhr.open("PUT", "/media/upload/" + stageResult._id);
      xhr.send(formData);
      xhr.onload = async (e) => {
        this.status = Job.SUCCESS;
        this.element.replaceWith(this.parent.createIcon(this.id))
      };
    } catch(error) {
      window.toast.error("something went wrong: " + error);
    }
  }
}
