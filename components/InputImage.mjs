import Component from "./Component.mjs";
import InputFile from "./InputFile.mjs";

const stageImage = async (server, id, image) => {
  let body = {
    _id:`${id}`,
    type: image.type,
    size: image.size,
    captured: image.lastModified
  }
  let options = {
    method: 'PUT',
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  };
  let response = await fetch(`/media/stage/${server}`, options);
  let result = await response.json();

  if(response.ok) {
    return result
  } else {
    window.toast.error("something went wrong: " + result.message);
  }
}

export default class InputImage extends Component {
  constructor(props) {
    super(props);

    this.server = this.props.server || 'aws'; // default to S3, the other option is 'storj'
    this.imageRender = void 0

    this._fetchStarted = false
  }
  async render(element) {
    await super.render(element);

    if (this.props.data._id) {
      this.id = `${this.props.collection?this.props.collection+'/':''}${this.props.data._id}.${this.props.name}`;
    } else {
      this.id = void 0
    }

    this.imageBox = this.div('input-image');
    this.formBody = this.div('form-body',this.imageBox);
    this.progressDisplay = this.div('progress-display',this.formBody);
    this.inputFile = await this.draw(InputFile,{data:this.props.data,name:"icon",title:this.props.title,accept:"image/*"},this.formBody);
    this.inputFile.setFileListener(this.fileHandler)
    this.inputFile.setTextListener(this.textHandler)

    await this.updateImage();
  }
  textHandler = async (text) => {
    if(this.inputFile.disabled) return;
    this.inputFile.disabled = true
    this.inputFile.drawLoader()

    try {
      let url = text
      if(url.startsWith("http")) {
        url = url.replace(/^(http:\/\/|https:\/\/)/, "");
      }

      const result = await fetch("/media/image/url/"+url, {
        method: 'GET',
      })
      if(!result.ok) throw new Error(result.status)

      const blob = await result.blob()

      this.inputFile.disabled = false
      this.fileHandler(blob)
    } catch(error) {
      console.error("Text handler error:", error)
      window.toast.error("Something went wrong")

      this.inputFile.disabled = false
      this.drawImageRender()
    }
  }
  fileHandler = async (file) => {
    if(!file || this.inputFile.disabled) return;
    if(!file.type.startsWith("image/")) {
      this.drawImageRender()
      window.toast.error("Unknown file type")
      return;
    }

    this.inputFile.disabled = true
    this.inputFile.drawLoader()

    let success = false
    try {
      await this.uploadImage(file)
      success = true
    } catch(error) {
      console.error("Upload image error:", error)
      window.toast.error("Something went wrong")
    }

    this.inputFile.disabled = false

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
  async uploadImage(image) {
    if(!this.id) {
      throw new Error("No id")
    }
    const formData = new FormData();
    formData.append('file', image);

    const stageResult = await stageImage(this.server, this.id, image)

    const options = this.props.options?`?${this.props.options}`:'';
    const result = await fetch("/media/upload/"+stageResult._id+options, {
      method: 'PUT',
      body: formData
    })
    if(!result.ok) throw new Error(result.status)
  }
  async updateImage() {
    let url = `/media/image/id/${this.id}`;
    let test = await fetch(url);

    if (test.ok) {
      this.imageRender = document.createElement('img');
      this.imageRender.src = url;
      this.drawImageRender()
    }
  }
  get value() {
    return this.inputFile.value;
  }
  static jobs = [];
  async save() {
    if (this.inputFile.value) {
      let job = new Job(this);
      job.draw(this.progressDisplay);
      await job.stage();
      InputImage.jobs.push(job);
    }
  }
}

class Job {
  constructor(parent) {
    this.parent = parent;
    this.status = Job.NEW;
  }
  static NEW = 1;
  static UPLOAD = 2;
  static FAILED = 3;
  static SUCCESS = 4;
  static COMPLETE = 5;

  draw(hostElement) {
    this.element = document.createElement("div");
    this.element.classList.add('job');
    this.progressBar = document.createElement("div")
    this.progressBar.classList.add('progress');
    this.element.append(this.progressBar);
    hostElement.append(this.element);
  }
  destroy(wait=1000) {
    this.progressBar.style.backgroundColor = "red";
    setTimeout(()=>{
      this.element.remove();
      this.status = Job.COMPLETE;
    },wait)
  }

  /**
   * An upload is first staged to declare the metadata and track progress.
   * @returns {Promise<void>}
   */
  async stage() {
    let body = {
      _id:`${this.parent.id}`,
      type: this.parent.inputFile.value.type,
      size: this.parent.inputFile.value.size,
      captured: this.parent.inputFile.value.lastModified
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
      this.destroy(2000);
    }
  }

  async upload(stageResult) {
    try {
      let formData = new FormData();
      formData.append('file',this.parent.inputFile.value);

      let xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        this.progressBar.style.left = ((e.loaded / e.total) * 100)+"%";
      };
      let options = this.parent.props.options?`?${this.parent.props.options}`:'';
      xhr.open("PUT", "/media/upload/" + stageResult._id + options);
      xhr.send(formData);
      xhr.onload = async (e) => {
        this.status = Job.SUCCESS;
        await this.parent.updateImage();
        this.destroy();
      };
    } catch(error) {
      window.toast.error("something went wrong: " + error);
    }
  }
}

