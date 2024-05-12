import Component from './Component.mjs';
import {Button} from './Button.mjs';
import IdForge from './IdForge.mjs';
import API from './API.mjs';
import {InputSelect} from './InputSelect.mjs';
export default class InputMultipleImages extends Component {
  constructor(props) {
    super(props);
  }
  async render(element) {
    await super.render(element);
    await this.load();
    this.content = this.div('page-content');
    this.controls = this.div('page-controls');

    this.dropBox = this.div('drop-box',this.content);
    this.dropBox.ondrop = this.dropHandler.bind(this);
    this.dropBox.ondragover = this.dragHandler.bind(this);
    this.dropBox.onclick = await this.clickHandler.bind(this);
    let classification = this.props.classification?`${this.props.classification}/`:``;
    for (let item of this.imageList) {
      let img = document.createElement('img');
      img.src = `media/image/id/${classification}${item._id}?scale=60,60,cover`;
      img.id = item._id;
      img.classList.add("fixed");
      this.dropBox.append(img);
    }
    this.itemProperties = this.div('item-properties',this.content);
    await this.draw(Button,{name:'rotate',title:'Rotate'},this.controls);
    await this.draw(Button,{name:'delete',title:'Delete',click:()=>{
      API.remove('/media/image/')
    }},this.controls);
  }

  /**
   * Override this attribute as needed
   * @returns {*[]}
   */
  get imagePresets() {
    return [
        {name:'--no preset--',options: ''}
    ];
  }
  async load() {
    let classification = this.props.classification?`${this.props.classification}/`:``;
    this.imageList = await API.get(`/media/image/list/${classification}`+this.props.context.id);
  }
  async dropHandler(event) {
    event.preventDefault();
    if (event.dataTransfer) {
      for (let file of event.dataTransfer.files) {
        let container = this.div('upload-container',this.dropBox)
        let img = document.createElement('img');
        img.id = IdForge.datedId();
        img.src = URL.createObjectURL(file);
        img.style.clipPath = "circle(0%)";
        container.append(img);
        container.job = new Job(this,img,file);
        await container.job.stage(img.id);
      }
    }
  }
  async clickHandler(event) {
    this.itemProperties.innerHTML = '';
    let id = event.target.id;
    let imageContainer = this.div('properties-image-container',this.itemProperties);
    imageContainer.innerHTML = 'Loading...';
    let img = document.createElement('img');
    let classification = this.props.classification?`${this.props.classification}/`:''
    img.src = `media/image/id/${classification}${id}`;
    imageContainer.append(img);
    let detailsContainer = this.div('properties-details-container',this.itemProperties);
    detailsContainer.innerHTML = `<h2>${id}</h2>`;
    let preset = await this.draw(InputSelect,{name:'preset',options:this.imagePresets,hideTitle:true},detailsContainer);
  }
  dragHandler(event) {
    event.preventDefault();
  }
  textHandler = async (input,text) => {
    if(input.disabled) return;
    input.disabled = true
    input.drawLoader()

    try {
      let url = text
      if(url.startsWith("http")) {
        url = url.replace(/^(http:\/\/|https:\/\/)/, "");
      }
      url = encodeURIComponent(url)

      const result = await fetch("/media/image/url/"+url, {
        method: 'GET',
      })
      if(!result.ok) throw new Error(result.status)

      const blob = await result.blob()

      input.disabled = false
      await this.fileHandler(input,blob);
    } catch(error) {
      console.error("Text handler error:", error)
      window.toast.error("Something went wrong")

      input.disabled = false
      this.drawImageRender()
    }
  }
  fileHandler = async (input,file) => {
    if(!file || input.disabled) return;
    if(!file.type.startsWith("image/")) {
      this.drawImageRender()
      window.toast.error("Unknown file type")
      return;
    }

    input.disabled = true
    input.drawLoader()

    let success = false
    try {
      await this.uploadImage(file)
      success = true
    } catch(error) {
      console.error("Upload image error:", error)
      window.toast.error("Something went wrong")
    }

    input.disabled = false

    if(success) {
      await this.updateImage()
    } else {
      this.drawImageRender()
    }
  }
  drawImageRender() {
    if(this.imageRender) {
      this.inputFile.drawContent(this.imageRender);
    } else {
      this.inputFile.drawContent("");
    }
  }
}

class Job {
  constructor(parent,element,file) {
    this.parent = parent;
    this.element = element;
    this.file = file;
    this.status = Job.NEW;
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
  async stage(id) {
    let body = {
      _id:`${this.parent.props.context.id}/${id}.image`,
      type: this.file.type,
      size: this.file.size,
      captured: this.file.lastModified,
      account:this.parent.props.context.id
    }
    if (this.parent.props.classification) {
      body._id = `${this.parent.props.classification}/${body._id}`;
      body.classification = this.parent.props.classification;
    }
    let options = {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    };
    let response = await fetch(`/media/stage/`, options);
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
      let options = this.parent.props.options?`?${this.parent.props.options}`:'';
      xhr.open("PUT", "/media/upload/" + stageResult._id + options);
      xhr.send(formData);
      xhr.onload = async (e) => {
        this.status = Job.SUCCESS;
        // await this.parent.updateImage();
      };
    } catch(error) {
      window.toast.error("something went wrong: " + error);
    }
  }
}
