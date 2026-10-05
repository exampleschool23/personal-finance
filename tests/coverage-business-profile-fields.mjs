import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,text,byType,host} from './helpers/component-tree.mjs';

// The translator marks every message, so the test can tell a translated error from a raw one.
const t=message=>`«${message}»`;
function setup(value={name:'Bakery',business_structure:null,business_color:null,business_logo:null},disabled){
 const clicks=[];
 const renderer=createRenderer({attach:element=>element.type==='input'?{click:()=>clicks.push('file')}:null});
 const {BusinessProfileFields}=renderer.load('components/business-profile-fields.tsx',{
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t})},
  '@/components/ui/button':{Button:host('button')},'@/components/ui/native-select':{NativeSelect:host('select')},
 });
 const patches=[];
 const props={value,disabled,onChange:patch=>{patches.push(patch);props.value={...props.value,...patch};}};
 const view={patches,clicks,props,renderer,find:renderer.find,all:renderer.all,render:()=>(view.tree=renderer.render(renderer.react.createElement(BusinessProfileFields,props)))};
 view.render();
 return view;
}
/** Picks `file` in the hidden input and waits for the logo to be read. */
async function pick(view,file){
 const input=view.find(node=>node.type==='input');
 const target={files:file?[file]:[],value:'C:\\fakepath\\logo'};
 await input.props.onChange({currentTarget:target});
 view.render();
 return target;
}
/** A canvas whose data URLs are scripted per format and quality. */
function canvasReturning(urls,{context=true}={}){
 const drawn=[],asked=[];
 globalThis.document={createElement:tag=>{assert.equal(tag,'canvas');return {width:0,height:0,getContext:kind=>{assert.equal(kind,'2d');return context?{drawImage:(...args)=>drawn.push(args)}:null;},toDataURL:(type,quality)=>{asked.push([type,quality]);return urls(type,quality);}};}};
 return {drawn,asked};
}
const image=(type='image/png')=>({type,name:'logo'});
globalThis.createImageBitmap=async()=>({width:256,height:128});

test('the legal structure select lists every structure and clears to none',()=>{
 const view=setup();
 const select=view.find(node=>node.type==='select');
 assert.equal(select.props.value,'');
 const options=view.all(node=>node.type==='option',select).map(option=>[option.props.value,text(option)]);
 assert.deepEqual(options,[['','«Not set»'],['sole_proprietorship','«Sole proprietorship»'],['llc','«Single-member LLC»'],['partnership','«Partnership»'],['rental_property','«Rental property»'],['other','«Other business»']]);
 select.props.onChange({currentTarget:{value:'llc'}});
 select.props.onChange({currentTarget:{value:''}});
 assert.deepEqual(view.patches,[{business_structure:'llc'},{business_structure:null}]);
});

test('the colour radios default to grey and pick a colour',()=>{
 const view=setup();
 const radios=view.all(node=>node.props.role==='radio');
 assert.equal(radios.length,10);
 assert.deepEqual(radios.filter(radio=>radio.props['aria-checked']).map(radio=>radio.props['aria-label']),['«Grey»']);
 assert.equal(view.find(node=>node.props.role==='radiogroup').props['aria-label'],'«Colour»');
 const teal=radios.find(radio=>radio.props['aria-label']==='«Teal»');
 assert.match(teal.props.style['--swatch'],/175/);
 teal.props.onClick();view.render();
 assert.deepEqual(view.patches,[{business_color:'teal'}]);
 assert.equal(view.find(node=>node.props['aria-label']==='«Teal»').props['aria-checked'],true);
});

test('Upload logo opens the file chooser; a chosen logo can be changed or removed',()=>{
 const view=setup();
 assert.equal(text(view.find(node=>node.props.className==='business-mark')),'B');
 assert.equal(view.all(node=>node.type==='button'&&text(node).includes('«Remove»')).length,0);
 view.find(byType('button','«Upload logo»')).props.onClick();
 assert.deepEqual(view.clicks,['file']);
 const withLogo=setup({name:'',business_structure:'other',business_color:'red',business_logo:'data:image/webp;base64,AAA'});
 assert.equal(withLogo.find(node=>node.type==='img').props.src,'data:image/webp;base64,AAA');
 assert.equal(withLogo.find(node=>node.type==='select').props.value,'other');
 withLogo.find(byType('button','«Change logo»'));
 withLogo.find(byType('button','«Remove»')).props.onClick();withLogo.render();
 assert.deepEqual(withLogo.patches,[{business_logo:null}]);
 assert.equal(text(withLogo.find(node=>node.props.className==='business-mark')),'?','no name shows a question mark');
});

test('disabled fields stay disabled',()=>{
 const view=setup({name:'Shop',business_structure:null,business_color:null,business_logo:'data:x'},true);
 assert.equal(view.find(node=>node.type==='select').props.disabled,true);
 assert.equal(view.find(node=>node.type==='fieldset').props.disabled,true);
 // Colour swatches are disabled through their fieldset; the logo buttons on their own.
 const buttons=view.all(node=>node.type==='button'&&node.props.role!=='radio');
 assert.equal(buttons.length,2);
 for(const button of buttons)assert.equal(button.props.disabled,true);
});

test('a picked image is cropped to a 128px square and saved as WebP',async()=>{
 const canvas=canvasReturning((type,quality)=>`data:${type};q=${quality}`);
 const view=setup();
 const target=await pick(view,image());
 assert.equal(target.value,'','the input resets so the same file can be picked again');
 assert.deepEqual(view.patches,[{business_logo:'data:image/webp;q=0.85'}]);
 // A 256 x 128 picture fills the square at its height, centred.
 assert.deepEqual(canvas.drawn[0].slice(1),[-64,0,256,128]);
 assert.deepEqual(canvas.asked,[['image/webp',.85]]);
});

test('large images step down the quality, then fall back to JPEG, then fail',async()=>{
 const big='x'.repeat(60001);
 let canvas=canvasReturning((type,quality)=>type==='image/webp'&&quality===.5?'data:image/webp;small':`data:${type};${big}`);
 let view=setup();
 await pick(view,image('image/jpeg'));
 assert.deepEqual(canvas.asked.map(([,quality])=>quality),[.85,.7,.5]);
 assert.deepEqual(view.patches,[{business_logo:'data:image/webp;small'}]);
 // Browsers without WebP encoding answer with PNG; the JPEG fallback is used.
 canvas=canvasReturning(type=>type==='image/jpeg'?'data:image/jpeg;ok':'data:image/png;nope');
 view=setup();
 await pick(view,image('image/webp'));
 assert.deepEqual(view.patches,[{business_logo:'data:image/jpeg;ok'}]);
 assert.deepEqual(canvas.asked.at(-1),['image/jpeg',.6]);
 canvasReturning(type=>`data:${type};${big}`);
 view=setup();
 await pick(view,image());
 assert.deepEqual(view.patches,[]);
 assert.equal(text(view.find(node=>node.props.role==='alert')),'«This image is too large. Choose a smaller one.»');
});

test('unsupported files, unreadable images and no file at all are handled',async()=>{
 canvasReturning(()=>'data:image/webp;ok');
 let view=setup();
 await pick(view,image('image/gif'));
 assert.equal(text(view.find(node=>node.props.role==='alert')),'«Choose a PNG, JPEG or WebP image.»');
 // A later good pick clears the error.
 await pick(view,image());
 assert.equal(view.all(node=>node.props.role==='alert').length,0);
 assert.deepEqual(view.patches,[{business_logo:'data:image/webp;ok'}]);
 canvasReturning(()=>'',{context:false});
 view=setup();
 await pick(view,image());
 assert.equal(text(view.find(node=>node.props.role==='alert')),'«Could not read this image.»');
 const original=globalThis.createImageBitmap;
 globalThis.createImageBitmap=async()=>{throw Error('');};
 view=setup();
 await pick(view,image());
 assert.equal(text(view.find(node=>node.props.role==='alert')),'«Could not read this image.»','an error without a message');
 globalThis.createImageBitmap=original;
 view=setup();
 const target=await pick(view,null);
 assert.equal(target.value,'');
 assert.deepEqual(view.patches,[]);
 assert.equal(view.all(node=>node.props.role==='alert').length,0);
 await view.renderer.flush();
});
