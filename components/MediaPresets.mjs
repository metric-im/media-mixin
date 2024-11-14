/**
 * Presets set the default formatting for different target systems.
 * Presets are invoked by adding the preset name as a label after the
 * image id. Preset may be customized, same as the original image.
 *
 * Override presets as needed. Merge down when they become common
 */
export default {
  FB:{_id:'FB',name:'Facebook',options:'scale=600,900,cover'},
  OB:{_id:'OB',name:'Outbrain',options:'scale=640,480,cover'},
  TW:{_id:'TW',name:'X/Twitter',options:'scale=400,400,cover'},
  SEZ:{_id:'SEZ',name:'Sez.us',options:'scale=400,400,cover'},
  icon:{_id:'icon',name:'Icon',options:'scale=50,50,cover'},
  original:{_id:'original',name:'Original',options: ''}
}


