/// <reference path="../../node_modules/@types/geojson/index.d.ts" />

import * as MapboxGL from 'mapbox-gl';
import * as $ from 'jquery';
import * as geoJson from 'geojson';
import * as tj from '@mapbox/togeojson';
import { LatLng, LatLngBounds } from 'leaflet';

export interface Category {
  displayOnLoad?: boolean,
  browsable?: boolean,
  remoteData?: {},
  name: string,
  id?: number,
  color?: string,
  iconUrl?: string,
}
export interface IPrintableMap {
  map:MapboxGL.Map;
  updated:Date;
  addMarker(feature:geoJson.Feature, category:Category): void;
}
export interface IPrintableMapListener {
  POIFiltered(targets:MapboxGL.Marker[]):void;
}
export interface Legend {
  color: string;
  name: string;
}

/**
 * extend L.Layer to store category data
 */
export interface MyLayer extends L.Layer {
  category:Category;
}
export var DEFAULT_ICON_COLOR:string = "lightgreen";
/**
 * main class of PrintableMap
 */
export default class PrintableMap implements IPrintableMap{
  map:MapboxGL.Map;   //map object
  updated:Date;  // last updated
  legends: Legend[] = [];  // legends data
  layers: any[] = [];
  layerid: number = 0;
  bounds: MapboxGL.LngLatBounds ;
  /**
   * constructor
   * @param host host string of application, like codeforjapan.github.io
   * @param divid div id of a map container.
   * @param listener listener class which receives an event after POI is filtered by moving a map.
   */
  constructor (public host:string, public divid :string, public listener?: IPrintableMapListener){
    this.map = new MapboxGL.Map({
      container: divid,
      center: [127.88768305343456,26.710444962177604],
      zoom: 13,
      style: {
        "version": 8,
        "sources": {
          "OSM": {
            "type": "raster",
            "tiles": [ tileServerUrl('mono', host )],
            "tileSize": 256
          }
        },
        "layers": [{
          "id": "OSM",
          "type": "raster",
          "source": "OSM",
          "minzoom": 0,
          "maxzoom": 22
        }]
      }
    });
    //attribution: tileServerAttribution(host),

    var that = this;
    this.map.on("moveend", function(){
      this.targets = [];
      let bounds = this.getBounds();
      let s = serializeBounds(bounds);
      let path = location.pathname;
      window.history.pushState('', '', path + '#' + s);
      //$('#list').html('<table>');
      that.layers.forEach((layer:any) => {
        if(that.inBounds(new MapboxGL.LngLat(layer.geometry.coordinates[0],layer.geometry.coordinates[1]), this.getBounds())) {
          if (layer.properties === undefined) {
            return false;
          } else {
            var name = layer.properties.name;
            if (name !== undefined) {
              this.targets.push(layer);
            }
          }
        }
      });
      console.log(this.targets);
      //sort targets
      var res = this.targets.sort(function(a,b){
          var _a = a.feature ? a.feature.properties.name : null;
          var _b = b.feature ? b.feature.properties.name : null;
          var _a2 = a.properties.category.name;
          var _b2 = b.properties.category.name;
          if(_a2 > _b2){
              return -1;
          }else if(_a2 < _b2){
              return 1;
          }
          return 0;
      });
      res.forEach(function(layer,index){
        $("#layer-" + layer.properties.layerid + " b.number").html(index + 1);
      });
      // call listener function if an instance is specified.
      if (that.listener !== undefined){
        that.listener.POIFiltered(res);
      }
    });
  }
  addFeatureCollection(features:geoJson.FeatureCollection, category:Category): void{
    features.features.forEach((feature:geoJson.Feature)=>{
      if (feature.geometry.type == "Point"){
        this.addMarker(feature, category);
      }
    });
  }
  /**
   *
   * @param feature Feature object based on GeoJson
   * @param category Category of the feacures
   */
  addMarker(feature:any, category:Category): void{
    this.bounds.extend(feature.geometry.coordinates);
    if (!this.legends.some((legend) =>{
      return legend.name == category.name;
    })){
      this.legends.push({name:category.name, color:category.color!});
    }
    var el:HTMLDivElement = document.createElement('div');
    el.innerHTML = '<span style="background:' + category.color!.toLowerCase() + '"><b class="number">0</b></span>'
    el.className = 'marker';
    el.id = 'layer-' + this.layerid;
    let desc = feature.properties.description ? feature.properties.description : "";
    new MapboxGL.Marker(el)
    .setLngLat(feature.geometry.coordinates)
    .setPopup(new MapboxGL.Popup({
      offset: 25
    }) // add popups
    .setHTML('<h3>名称:' + feature.properties.name + '</h3><p>' + desc + '</p>'))
    .addTo(this.map);
    feature.properties.category = category;
    feature.properties.layerid = this.layerid;
    this.layers.push(feature);
    this.layerid += 1;
  }
  /**
   * load Json String based on umap file
   * @param umapJsonData umap style geojson string
   */
  loadUmapJsonData(data:any):void{
    //let data = JSON.parse(jsonstring)
    data.layers.forEach( (layer) => {
      let category:Category = layer._umap_options
      layer.features.forEach((feature) => {
        this.addMarker(feature, category);
      });
    });
  }
  loadKMLData(data:Document){
    let that = this;
    let folders:HTMLCollectionOf<Element> = data.getElementsByTagName('Folder');
    if (folders.length == 0) {
      folders = data.getElementsByTagName('Document');
    }
    Array.prototype.forEach.call(folders, (folder) => {
      let category:Category = readCategoryOfFolder(folder, data);
      if (tj.kml(folder).type == "FeatureCollection"){
        let geojsondata:geoJson.FeatureCollection = tj.kml(folder);
        that.addFeatureCollection(geojsondata, category);
      }else{
        let geojsondata:geoJson.Feature　= tj.kml(folder);
        that.addMarker(geojsondata, category);
      }
    });
  }

  /**
   * Load file and add markers
   * @param url file path
   */
  loadFile(url:string):void{
    this.legends = [];
    this.bounds = new MapboxGL.LngLatBounds();
    $.ajax(url).then((data, textStatus, jqXHR)=> {
      // データの最終更新日を表示（ローカルでは常に現在時刻となる）
      //var date = DisplayHelper.getNowYMD(new Date(jqXHR.getResponseHeader('date')));
      this.updated = new Date(jqXHR.getResponseHeader('date')!);
      if (jqXHR.responseXML){
        console.log("call XML data")
        this.loadKMLData(data);
        console.log("legends length is " + this.legends.length);
      }else if(jqXHR.responseJSON){ // it must be json data
        console.log("call JSON data")
        this.loadUmapJsonData(data);
        console.log("legends length is " + this.legends.length);
      }else{
        // it may be json
        this.loadUmapJsonData(JSON.parse(data));
      }
      this.showLegend();
      this.fitBounds();
    }).catch((jqXHR, textStatus, errorThrown) => {
      console.log('error:' + jqXHR['message']);
      throw new Error(errorThrown);
    });
  }
  /**
   * show legends data
   */
  showLegend():void{
    var div = $("#legend");
    div.html("");
    // loop through our density intervals and generate a label with a colored square for each interval
    for (var i = 0; i < this.legends.length; i++) {
      div.append(
      '<div class="legend-type">' +
        '<i style="background:' + this.legends[i].color + '"></i><div class=poi-type> ' + this.legends[i].name + '</div></br>' +
      '</div>');
    }
  }
  /**
   * fit bounds to layers
   */
  fitBounds():void {
    try {
      const boundsstr = this.getLocationHash();
      var bounds = deserializeBounds(this.getLocationHash());
      this.map.fitBounds(bounds);
    } catch(e) {
      this.map.fitBounds(this.bounds);
    }
  }
  getLocationHash():string{
    return window.location.hash.substr(1);
  }
  inBounds(point:MapboxGL.LngLat, bounds:MapboxGL.LngLatBounds) {
    var lng = (point.lng - bounds.getNorthEast().lng) * (point.lng - bounds.getSouthWest().lng) < 0;
    var lat = (point.lat - bounds.getNorthEast().lat) * (point.lat - bounds.getSouthWest().lat) < 0;
    return lng && lat;
  }
}

export function tileServerAttribution(host:string):string{
  return ( host === 'codeforjapan.github.io' ) ?
  "Maptiles by <a href='http://mierune.co.jp/' target='_blank'>MIERUNE</a>, under CC BY. Data by <a href='http://osm.org/copyright' target='_blank'>OpenStreetMap</a> contributors, under ODbL." :
  'Map data © <a href="http://openstreetmap.org/">OpenStreetMap</a>';
}

export function tileServerUrl(mapStyle:string, host:string):string{
  // 地図の色はnormal,grey, mono, bright, blueが選択できる。
  // 印刷時の視認性の高さからカラーはbright、白黒にはgrayを使用する。
  var styleCode;
  if(mapStyle === 'color'){
    styleCode = 'bright';
  } else if(mapStyle === 'mono'){
    styleCode = 'gray';
  } else {
    styleCode = 'normal';
  }
  // MIERUNEMAPのAPIキーはローカル環境では表示されないのでご注意(https://codeforjapan.github.io/以下でのみ表示される）
  // サーバ上の場合のみMIERUNE地図を使う
  return ( host === 'codeforjapan.github.io' ) ?
  'https://tile.cdn.mierune.co.jp/styles/' + styleCode + '/{z}/{x}/{y}.png?key=KNmswjVYR187ACBqbsZc5fEIBM_DC2TXwMST0tVMe4AiYCt274X0VqAy5pf-ebvl8CtjAtBx15r1YyAiXURC' :
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png';
}
function serializeLatLng(latLng) {
  return '' + latLng.lat + ',' + latLng.lng;
}
function serializeBounds(bounds) {
  return serializeLatLng(bounds.getNorthWest()) + '-' +
      serializeLatLng(bounds.getSouthEast());
}
export function deserializeLatLng(s:string) {
  let [slng, slat] = s.split(',', 2);
  let lng = parseFloat(slng);
  let lat = parseFloat(slat);
  return new MapboxGL.LngLat(lng,lat);
}
export function deserializeBounds(s) {
  return new MapboxGL.LngLatBounds(s.split('-', 2).map(function(d) {return deserializeLatLng(d);}));
}
/**
 * return Category object
 * @param folder
 * @param document
 */
export function readCategoryOfFolder(folder:Element, document:Document):Category{
  let catname:string = folder.getElementsByTagName("name")[0].textContent!;
  let color:string = "red";
  let iconUrl;
  let styleUrl:string = folder.getElementsByTagName("styleUrl")[0].textContent!;
  if (styleUrl){
    let styles:NodeListOf<Element> = document.querySelectorAll(styleUrl + " Pair")!;
    if (styles.length > 0) {
      Array.prototype.forEach.call( styles, (elem) => {
        let key = elem.querySelector("key");
        if (key && key.textContent == "normal"){
          let styleUrl = elem.querySelector("styleUrl").textContent;
          let style = document.querySelector(styleUrl);
          try{
            color = "#" + style.querySelector("IconStyle color").textContent;
          }catch(e){
            color = DEFAULT_ICON_COLOR;
          }
          // iconUrl = style.querySelector("IconStyle Icon href").textContent;
        }
      });
    }
  }
  return {name:catname, color:color, iconUrl: iconUrl};
}
