"""Independent exact checks for the author-written preparatory bank."""
import json,re,math,itertools
from fractions import Fraction as F
from pathlib import Path
source=Path(__file__).resolve().parents[1].joinpath('index.html').read_text()
bank=json.loads(re.search(r'const EXAM_QUESTIONS = (\[.*?\]);\nQUESTIONS',source,re.S).group(1))
assert len(bank)==130 and len({q['uid'] for q in bank})==130
assert {q['examNumber'] for q in bank}==set(range(1,21))
assert sum(q['examPart']==1 for q in bank)==85
assert sum(q['examPart']==2 for q in bank)==45
for number in range(1,21):
 assert sum(q['examNumber']==number for q in bank)==(25 if number==6 else 15 if number==17 else 5)
for q in bank:
 p=q['audit'];kind=p['type'];expected=None
 assert q['examYear']==2027 and q['examPart']==(1 if q['examNumber']<=13 else 2)
 if kind=='exam_triangle_area':expected=F(p['a']*p['b'],2)
 elif kind=='exam_dot':expected=sum(x*y for x,y in zip(p['u'],p['v']))
 elif kind=='exam_prism_volume':expected=F(p['a']*p['b']*p['h'],2)
 elif kind=='exam_classical':expected=F(p['good'],p['total'])
 elif kind=='exam_one_success':
  a,b=F(p['p']),F(p['q']);expected=a+b-2*a*b
 elif kind in ['exam_expectation','exam_variance','exam_standard_deviation']:
  a,b,prob=p['a'],p['b'],F(p['p']);mean=a*prob+b*(1-prob)
  variance=prob*(a-mean)**2+(1-prob)*(b-mean)**2
  expected=mean if kind=='exam_expectation' else variance
  if kind=='exam_standard_deviation':
   assert math.isqrt(variance.numerator)**2==variance.numerator and math.isqrt(variance.denominator)**2==variance.denominator
   expected=F(math.isqrt(variance.numerator),math.isqrt(variance.denominator))
 elif kind=='exam_log_equation':
  expected=p['base']**p['power']-p['shift'];assert expected+p['shift']>0
 elif kind=='exam_power_fraction':expected=F(p['a']**5,p['a']**3*p['b'])
 elif kind=='exam_tangent':expected=3*p['x']**2-p['a']
 elif kind=='exam_power_model':expected=p['r']*p['current']**2
 elif kind=='exam_meeting':expected=F(p['distance'],p['slow']+p['fast'])
 elif kind=='exam_function_intersection':expected=F(p['c']-p['b'],p['k'])
 elif kind=='exam_equal_principal':
  annual=F(p['principal'],p['n']);r=F(p['rate'],100)
  expected=sum(annual+(p['principal']-i*annual)*r for i in range(p['n']))
 elif kind=='exam_binomial_mean':expected=p['n']*F(p['p'])
 elif kind=='exam_binomial_variance':expected=p['n']*F(p['p'])*(1-F(p['p']))
 elif kind=='exam_uniform_interval':
  assert p['lo']<=p['left']<p['right']<=p['hi'];expected=F(p['right']-p['left'],p['hi']-p['lo'])
 elif kind=='exam_normal_symmetry':expected=1-2*F(p['p']);assert 0<expected<1
 elif kind=='exam_cos_selection':
  angles={r'\frac{\pi}{3}':math.pi/3,r'\frac{\pi}{4}':math.pi/4,r'\frac{\pi}{6}':math.pi/6,r'\frac{2\pi}{3}':2*math.pi/3,r'\frac{3\pi}{4}':3*math.pi/4}
  angle=angles[p['angle']]
  roots=sorted(s*angle+2*math.pi*n for s in [-1,1] for n in range(-3,5) if 2*math.pi<=s*angle+2*math.pi*n<=4*math.pi)
  assert len(roots)==2 and all(abs(a-b)<1e-12 for a,b in zip(roots,[2*math.pi+angle,4*math.pi-angle]))
 elif kind=='exam_square_prism_distance':
  a,h=p['a'],p['h'];normal=(a,-a,0)
  assert sum(x*y for x,y in zip(normal,(a,a,0)))==0 and sum(x*y for x,y in zip(normal,(0,0,h)))==0
  distance=abs(a*a)/math.sqrt(2*a*a);assert abs(distance-a/math.sqrt(2))<1e-12
 elif kind=='exam_rational_inequality':
  for i in range(-200,201):
   x=F(i,10)
   if x==p['b']:continue
   assert ((x-p['a'])/(x-p['b'])>=0)==(x<=p['a'] or x>p['b'])
 elif kind=='exam_fence_optimum':
  L=p['length'];opt=F(L,4);mx=F(L*L,8)
  assert 0<opt<L/2
  for i in range(1,100):
   x=F(L*i,200);area=x*(L-2*x)
   assert mx-area==2*(x-opt)**2 and area<=mx
 elif kind=='exam_profit_optimum':
  A,B,c,fixed=p['A'],p['B'],p['c'],p['F'];opt=F(A+B*c,2*B);mx=(opt-c)*(A-B*opt)-fixed
  assert 0<=opt<=F(A,B)
  for i in range(101):
   price=F(A*i,100*B);profit=(price-c)*(A-B*price)-fixed
   assert mx-profit==B*(price-opt)**2
 elif kind=='exam_load_power':
  E,r=p['E'],p['r'];mx=F(E*E,4*r);threshold=mx/2
  for i in range(1,100):
   R=F(r*i,10);power=E*E*R/(R+r)**2
   assert mx-power==F(E*E,4*r)*(R-r)**2/(R+r)**2
   assert (power>=threshold)==(R*R-6*r*R+r*r<=0)
  for u in [3-2*math.sqrt(2),3+2*math.sqrt(2)]:assert abs(u*u-6*u+1)<1e-12 and u>0
 elif kind=='exam_right_triangle_altitude':
  a,b,c=p['a'],p['b'],p['hyp'];assert a*a+b*b==c*c
  ah,bh,ch=F(a*a,c),F(b*b,c),F(a*b,c);assert ah+bh==c and ch*ch==ah*bh
 elif kind=='exam_positive_roots_parameter':
  k,t=p['k'],p['t'];assert t==k*(k-1)
  for i in range(-200,301):
   a=F(i,10);disc=a*a-a-t
   assert (disc>0 and 2*a>0 and a+t>0)==(a>k)
 elif kind=='exam_distinct_set_bound':
  k,S,sample=p['k'],p['S'],p['sample']
  assert len(set(sample))==k and min(sample)>0 and sum(sample)==S and max(sample)==k+1
  assert k*(k+1)//2<S<(k+1)*(k+2)//2
  assert not any(sum(c)==S for c in itertools.combinations(range(1,k+1),k))
  assert any(sum(c)==S for c in itertools.combinations(range(1,k+2),k))
 else:raise AssertionError('Unknown audit '+kind)
 if q['examPart']==1:
  assert q['response']['kind']=='number' and F(q['response']['answer'])==expected,(q['uid'],expected)
 else:
  assert q['response']['kind']=='solution' and len(q['response']['rubric'])==3
 assert q['explanation'] and q['prompt'] and not q['choices']
print('PASS: all 130 tasks, all 20 positions, 85 exact short answers, 45 written-solution audits; domains, inequalities, parameter cases, constructions and optimization identities.')
