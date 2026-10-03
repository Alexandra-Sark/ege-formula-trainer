(function (root) {
  'use strict';
  const groups = {
    algebra: 'Алгебра', powers: 'Степени и логарифмы', trigonometry: 'Тригонометрия',
    geometry: 'Планиметрия', solids: 'Стереометрия', derivatives: 'Производные',
    progressions: 'Прогрессии', probability: 'Вероятность и статистика'
  };
  const formulas = [];
  function add(group, id, name, template, options, condition = '') {
    formulas.push({id, group, name, template, answer: options[0], options, condition,
      tex: template.replace('__', options[0])});
  }
  const t = String.raw;
  add('algebra','square-sum','Квадрат суммы',t`(a+b)^2=a^2+__+b^2`,[t`2ab`,t`ab`,t`2a^2b^2`,t`a+b`]);
  add('algebra','square-difference','Квадрат разности',t`(a-b)^2=a^2-__+b^2`,[t`2ab`,t`ab`,t`2a^2`,t`a^2b^2`]);
  add('algebra','difference-squares','Разность квадратов',t`a^2-b^2=(a-b)__`,[t`(a+b)`,t`(a-b)`,t`(a^2+b^2)`,t`2ab`]);
  add('algebra','cube-sum','Куб суммы',t`(a+b)^3=a^3+3a^2b+__+b^3`,[t`3ab^2`,t`3a^2b`,t`ab`,t`3ab`]);
  add('algebra','cube-difference','Куб разности',t`(a-b)^3=a^3-3a^2b+__-b^3`,[t`3ab^2`,t`3a^2b`,t`ab^2`,t`3ab`]);
  add('algebra','sum-cubes','Сумма кубов',t`a^3+b^3=(a+b)(a^2__+b^2)`,[t`-ab`,t`+ab`,t`-2ab`,t`+2ab`]);
  add('algebra','difference-cubes','Разность кубов',t`a^3-b^3=(a-b)(a^2__+b^2)`,[t`+ab`,t`-ab`,t`+2ab`,t`-2ab`]);
  add('algebra','discriminant','Дискриминант квадратного уравнения',t`D=b^2-__`,[t`4ac`,t`2ac`,t`4a^2c`,t`4bc`],t`ax^2+bx+c=0,\quad a\ne0`);
  add('algebra','quadratic-roots','Корни квадратного уравнения',t`x_{1,2}=\frac{-b\pm\sqrt{D}}{__}`,[t`2a`,t`a`,t`2b`,t`4a`],t`a\ne0,\quad D\ge0`);
  add('algebra','vieta-sum','Теорема Виета: сумма корней',t`x_1+x_2=__`,[t`-\frac{b}{a}`,t`\frac{b}{a}`,t`\frac{c}{a}`,t`-\frac{c}{a}`],t`ax^2+bx+c=0,\quad a\ne0,\quad D\ge0`);
  add('algebra','vieta-product','Теорема Виета: произведение корней',t`x_1x_2=__`,[t`\frac{c}{a}`,t`-\frac{c}{a}`,t`\frac{b}{a}`,t`-\frac{b}{a}`],t`ax^2+bx+c=0,\quad a\ne0,\quad D\ge0`);
  add('powers','power-product','Произведение степеней с одинаковым основанием',t`a^m a^n=a^{__}`,[t`m+n`,t`mn`,t`m-n`,t`\frac mn`],t`a>0`);
  add('powers','power-quotient','Частное степеней с одинаковым основанием',t`\frac{a^m}{a^n}=a^{__}`,[t`m-n`,t`m+n`,t`mn`,t`n-m`],t`a>0`);
  add('powers','power-power','Степень степени',t`(a^m)^n=a^{__}`,[t`mn`,t`m+n`,t`m-n`,t`\frac mn`],t`a>0`);
  add('powers','negative-power','Степень с отрицательным показателем',t`a^{-n}=__`,[t`\frac{1}{a^n}`,t`-a^n`,t`\frac{1}{a^{-n}}`,t`-\frac{1}{a^n}`],t`a>0`);
  add('powers','sqrt-square','Корень из квадрата',t`\sqrt{a^2}=__`,[t`|a|`,t`a`,t`-a`,t`a^2`],t`a\in\mathbb{R}`);
  add('powers','log-product','Логарифм произведения',t`\log_a(xy)=\log_a x\ __\ \log_a y`,[t`+`,t`-`,t`\cdot`,t`:`],t`a>0,\ a\ne1,\ x>0,\ y>0`);
  add('powers','log-quotient','Логарифм частного',t`\log_a\frac{x}{y}=\log_a x\ __\ \log_a y`,[t`-`,t`+`,t`\cdot`,t`:`],t`a>0,\ a\ne1,\ x>0,\ y>0`);
  add('powers','log-power','Логарифм степени',t`\log_a(x^r)=__\log_a x`,[t`r`,t`\frac1r`,t`r^2`,t`-r`],t`a>0,\ a\ne1,\ x>0,\ r\in\mathbb{R}`);
  add('powers','log-base','Переход к новому основанию логарифма',t`\log_a b=\frac{\log_c b}{__}`,[t`\log_c a`,t`\log_a c`,t`\log_b c`,t`\log_c b`],t`a,b,c>0,\quad a\ne1,\ c\ne1`);
  add('powers','log-identity','Основное логарифмическое тождество',t`a^{\log_a b}=__`,[t`b`,t`a`,t`ab`,t`1`],t`a>0,\ a\ne1,\ b>0`);
  add('trigonometry','trig-identity','Основное тригонометрическое тождество',t`\sin^2\alpha+\cos^2\alpha=__`,[t`1`,t`0`,t`2`,t`\sin 2\alpha`]);
  add('trigonometry','tangent','Тангенс через синус и косинус',t`\operatorname{tg}\alpha=\frac{\sin\alpha}{__}`,[t`\cos\alpha`,t`\sin\alpha`,t`1`,t`\operatorname{ctg}\alpha`],t`\cos\alpha\ne0`);
  add('trigonometry','cotangent','Котангенс через синус и косинус',t`\operatorname{ctg}\alpha=\frac{\cos\alpha}{__}`,[t`\sin\alpha`,t`\cos\alpha`,t`1`,t`\operatorname{tg}\alpha`],t`\sin\alpha\ne0`);
  add('trigonometry','sin-double','Синус двойного угла',t`\sin 2\alpha=__\sin\alpha\cos\alpha`,[t`2`,t`1`,t`4`,t`-2`]);
  add('trigonometry','cos-double','Косинус двойного угла',t`\cos 2\alpha=\cos^2\alpha\ __\ \sin^2\alpha`,[t`-`,t`+`,t`\cdot`,t`:`]);
  add('trigonometry','sin-sum','Синус суммы',t`\sin(\alpha+\beta)=\sin\alpha\cos\beta\ __\ \cos\alpha\sin\beta`,[t`+`,t`-`,t`\cdot`,t`:`]);
  add('trigonometry','sin-difference','Синус разности',t`\sin(\alpha-\beta)=\sin\alpha\cos\beta\ __\ \cos\alpha\sin\beta`,[t`-`,t`+`,t`\cdot`,t`:`]);
  add('trigonometry','cos-sum','Косинус суммы',t`\cos(\alpha+\beta)=\cos\alpha\cos\beta\ __\ \sin\alpha\sin\beta`,[t`-`,t`+`,t`\cdot`,t`:`]);
  add('trigonometry','cos-difference','Косинус разности',t`\cos(\alpha-\beta)=\cos\alpha\cos\beta\ __\ \sin\alpha\sin\beta`,[t`+`,t`-`,t`\cdot`,t`:`]);
  add('trigonometry','sin-half','Квадрат синуса половинного угла',t`\sin^2\frac{\alpha}{2}=\frac{1\ __\ \cos\alpha}{2}`,[t`-`,t`+`,t`\cdot`,t`:`]);
  add('trigonometry','cos-half','Квадрат косинуса половинного угла',t`\cos^2\frac{\alpha}{2}=\frac{1\ __\ \cos\alpha}{2}`,[t`+`,t`-`,t`\cdot`,t`:`]);
  add('geometry','pythagoras','Теорема Пифагора',t`c^2=__`,[t`a^2+b^2`,t`a^2-b^2`,t`(a+b)^2`,t`2ab`],t`a,b\text{ — катеты},\ c\text{ — гипотенуза}`);
  add('geometry','triangle-height','Площадь треугольника через высоту',t`S=\frac{ah}{__}`,[t`2`,t`3`,t`4`,t`1`],t`h\text{ — высота к стороне }a`);
  add('geometry','triangle-sine','Площадь треугольника через две стороны и угол',t`S=\frac12 ab\ __`,[t`\sin\gamma`,t`\cos\gamma`,t`\operatorname{tg}\gamma`,t`\sin 2\gamma`],t`\gamma\text{ — угол между }a\text{ и }b`);
  add('geometry','heron','Формула Герона',t`S=\sqrt{p(p-a)(p-b)__}`,[t`(p-c)`,t`(p+c)`,t`c`,t`p`],t`p=\frac{a+b+c}{2}`);
  add('geometry','cosine-law','Теорема косинусов',t`c^2=a^2+b^2-__\cos\gamma`,[t`2ab`,t`ab`,t`2(a+b)`,t`a^2b^2`],t`\gamma\text{ — угол напротив стороны }c`);
  add('geometry','sine-law','Теорема синусов',t`\frac{a}{\sin\alpha}=\frac{b}{\sin\beta}=\frac{c}{\sin\gamma}=__`,[t`2R`,t`R`,t`R^2`,t`2r`],t`R\text{ — радиус описанной окружности}`);
  add('geometry','circle-area','Площадь круга',t`S=\pi __`,[t`r^2`,t`r`,t`2r`,t`r^3`]);
  add('geometry','circumference','Длина окружности',t`L=__\pi r`,[t`2`,t`1`,t`4`,t`\frac12`]);
  add('geometry','trapezoid-area','Площадь трапеции',t`S=\frac{a+b}{__}h`,[t`2`,t`3`,t`4`,t`1`],t`a,b\text{ — основания},\ h\text{ — высота}`);
  add('geometry','parallelogram-area','Площадь параллелограмма через угол',t`S=ab\ __`,[t`\sin\alpha`,t`\cos\alpha`,t`\operatorname{tg}\alpha`,t`\sin 2\alpha`],t`\alpha\text{ — угол между сторонами }a,b`);
  add('geometry','triangle-inradius','Площадь треугольника через вписанную окружность',t`S=__`,[t`pr`,t`2pr`,t`p/r`,t`\pi r^2`],t`p\text{ — полупериметр},\ r\text{ — радиус вписанной окружности}`);
  add('solids','prism-volume','Объём призмы',t`V=S_{\text{осн}}\ __`,[t`h`,t`\frac h3`,t`h^2`,t`3h`],t`h\text{ — высота}`);
  add('solids','pyramid-volume','Объём пирамиды',t`V=\frac{S_{\text{осн}}h}{__}`,[t`3`,t`2`,t`4`,t`1`]);
  add('solids','cylinder-volume','Объём цилиндра',t`V=\pi r^2\ __`,[t`h`,t`\frac h3`,t`h^2`,t`2h`]);
  add('solids','cone-volume','Объём конуса',t`V=\frac{\pi r^2h}{__}`,[t`3`,t`2`,t`4`,t`1`]);
  add('solids','sphere-volume','Объём шара',t`V=\frac43\pi __`,[t`r^3`,t`r^2`,t`r`,t`2r^3`]);
  add('solids','sphere-area','Площадь поверхности сферы',t`S=__\pi r^2`,[t`4`,t`2`,t`3`,t`\frac43`]);
  add('solids','cylinder-side','Площадь боковой поверхности прямого кругового цилиндра',t`S_{\text{бок}}=2\pi r\ __`,[t`h`,t`r`,t`\frac h3`,t`h^2`]);
  add('solids','cone-side','Площадь боковой поверхности прямого кругового конуса',t`S_{\text{бок}}=\pi r\ __`,[t`l`,t`h`,t`r`,t`l^2`],t`l\text{ — образующая},\ h\text{ — высота}`);
  add('derivatives','derivative-power','Производная степенной функции',t`(x^n)'=__`,[t`nx^{n-1}`,t`nx^{n+1}`,t`x^{n-1}`,t`n x^n`],t`x>0,\quad n\in\mathbb{R}`);
  add('derivatives','derivative-sin','Производная синуса',t`(\sin x)'=__`,[t`\cos x`,t`-\cos x`,t`\sin x`,t`-\sin x`],t`x\text{ в радианах}`);
  add('derivatives','derivative-cos','Производная косинуса',t`(\cos x)'=__`,[t`-\sin x`,t`\sin x`,t`\cos x`,t`-\cos x`],t`x\text{ в радианах}`);
  add('derivatives','derivative-exp','Производная экспоненты',t`(e^x)'=__`,[t`e^x`,t`xe^{x-1}`,t`e^{x-1}`,t`x e^x`]);
  add('derivatives','derivative-ln','Производная натурального логарифма',t`(\ln x)'=__`,[t`\frac1x`,t`x`,t`\ln x`,t`\frac1{\ln x}`],t`x>0`);
  add('derivatives','derivative-product','Производная произведения',t`(uv)'=u'v\ __\ uv'`,[t`+`,t`-`,t`\cdot`,t`:`],t`u,v\text{ дифференцируемы}`);
  add('derivatives','derivative-quotient','Производная частного',t`\left(\frac uv\right)'=\frac{u'v-uv'}{__}`,[t`v^2`,t`v`,t`u^2`,t`uv`],t`u,v\text{ дифференцируемы},\ v\ne0`);
  add('derivatives','derivative-chain','Производная сложной функции',t`(f(g(x)))'=f'(g(x))\ __`,[t`g'(x)`,t`g(x)`,t`f'(x)`,t`\frac1{g'(x)}`],t`f,g\text{ дифференцируемы в нужных точках}`);
  add('progressions','arithmetic-n','Общий член арифметической прогрессии',t`a_n=a_1+__d`,[t`(n-1)`,t`n`,t`(n+1)`,t`(n-2)`]);
  add('progressions','arithmetic-sum','Сумма арифметической прогрессии',t`S_n=\frac{a_1+a_n}{__}n`,[t`2`,t`3`,t`n`,t`1`]);
  add('progressions','arithmetic-middle','Средний член арифметической прогрессии',t`a_n=\frac{a_{n-1}+a_{n+1}}{__}`,[t`2`,t`3`,t`n`,t`1`],t`n\ge2`);
  add('progressions','geometric-n','Общий член геометрической прогрессии',t`b_n=b_1q^{__}`,[t`n-1`,t`n`,t`n+1`,t`n-2`]);
  add('progressions','geometric-sum','Сумма геометрической прогрессии',t`S_n=\frac{b_1(q^n-1)}{__}`,[t`q-1`,t`q+1`,t`q`,t`n-1`],t`q\ne1`);
  add('progressions','geometric-infinite','Сумма бесконечной убывающей геометрической прогрессии',t`S=\frac{b_1}{__}`,[t`1-q`,t`1+q`,t`q-1`,t`q`],t`|q|<1`);
  add('probability','classical-probability','Классическая формула вероятности',t`P(A)=\frac{__}{n}`,[t`m`,t`n-m`,t`n`,t`m+n`],t`m\text{ — благоприятные исходы};\ n>0\text{ равновозможных исходов}`);
  add('probability','complement','Вероятность противоположного события',t`P(\overline A)=__`,[t`1-P(A)`,t`P(A)-1`,t`1+P(A)`,t`\frac1{P(A)}`]);
  add('probability','independent-product','Вероятность пересечения независимых событий',t`P(A\cap B)=P(A)\ __\ P(B)`,[t`\cdot`,t`+`,t`-`,t`:`],t`A,B\text{ независимы}`);
  add('probability','union','Вероятность объединения событий',t`P(A\cup B)=P(A)+P(B)\ __\ P(A\cap B)`,[t`-`,t`+`,t`\cdot`,t`:`]);
  add('probability','expectation','Математическое ожидание дискретной случайной величины',t`E(X)=\sum_{i=1}^{n}x_i\ __`,[t`p_i`,t`p_i^2`,t`x_i`,t`\frac1{p_i}`],t`P(X=x_i)=p_i`);
  add('probability','variance','Дисперсия через второй момент',t`D(X)=E(X^2)\ __\ (E(X))^2`,[t`-`,t`+`,t`\cdot`,t`:`],t`E(X^2)<\infty`);
  add('probability','standard-deviation','Стандартное отклонение',t`\sigma=__`,[t`\sqrt{D(X)}`,t`D(X)^2`,t`D(X)`,t`\frac1{D(X)}`],t`E(X^2)<\infty`);
  const data = {groups, formulas};
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.FormulaGameData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
