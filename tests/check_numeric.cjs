const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context={};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function rationalDecimal('),source.indexOf('function decimalToken('))+source.slice(source.indexOf('function parseNumericResponse('),source.indexOf('function validNumberExample(')),context);
const {parseNumericResponse:parse,numericResponseMatches:matches,rationalDecimal}=context;
for(const [a,b] of [['0,25','1/4'],['.25','1/4'],['-,25','-1/4'],['1,(3)','4/3'],['0,1(6)','1/6'],['0.(3)','1/3'],['0,(9)','1'],['-2/-8','1/4'],['+0002,500','5/2'],['0,00(09)','1/1100'],['1000000000000000000001','1000000000000000000001']])assert(matches(a,b),a+' = '+b);
for(const raw of ['','1/0','0/0','1e3','NaN','Infinity','1,2,3','2,','(3)','1/(2)','0,()','0,(3)4','2+2','<script>','1//2','1 2','--1','1/2/3','2;3','0,'.repeat(101)])assert.equal(parse(raw),null,raw);
assert(!matches('0,333333333','1/3'));
assert(!matches('1,333333333','4/3'));
assert(!matches('9007199254740992','9007199254740993'));
let count=0;
for(let denominator=1;denominator<=97;denominator++)for(let numerator=-52;numerator<=52;numerator++){
 const decimal=rationalDecimal(numerator,denominator);
 assert(matches(decimal,`${numerator}/${denominator}`),decimal);
 assert(matches(decimal.replace(',','.'),`${numerator}/${denominator}`),decimal);
 count++;
}
console.log(`PASS: ${count} exact fraction/decimal/period round trips, malformed input, signs, leading zeros, large integers and rejection of approximations.`);
