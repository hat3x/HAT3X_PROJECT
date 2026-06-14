import absolutSprite from '@/assets/drinks/absolut-sprite.png';
import absolutVodka from '@/assets/drinks/absolut-vodka.png';
import agua from '@/assets/drinks/agua.png';
import appletiser from '@/assets/drinks/appletiser.png';
import aquarius from '@/assets/drinks/aquarius.png';
import bacardiCocacola from '@/assets/drinks/bacardi-cocacola.png';
import ballantines from '@/assets/drinks/ballantines.png';
import batido from '@/assets/drinks/batido.png';
import beefeater from '@/assets/drinks/beefeater.png';
import beefeater00 from '@/assets/drinks/beefeater-00.png';
import botellinCruzcampo from '@/assets/drinks/botellin-cruzcampo.png';
import cafe from '@/assets/drinks/cafe.png';
import cocaCola from '@/assets/drinks/coca-cola.png';
import cocaColaZero from '@/assets/drinks/coca-cola-zero.png';
import cremaRuavieja from '@/assets/drinks/crema-ruavieja.png';
import cruzcampoSinGluten from '@/assets/drinks/cruzcampo-sin-gluten.png';
import desperados from '@/assets/drinks/desperados.png';
import fantaNaranja from '@/assets/drinks/fanta-naranja.png';
import fuzetea from '@/assets/drinks/fuzetea.png';
import havanaClub from '@/assets/drinks/havana-club.png';
import heineken00 from '@/assets/drinks/heineken-00.png';
import infusion from '@/assets/drinks/infusion.png';
import jackDanielsCocacola from '@/assets/drinks/jack-daniels-cocacola.png';
import monsterBlanco from '@/assets/drinks/monster-blanco.png';
import monsterMangoLoco from '@/assets/drinks/monster-mango-loco.png';
import monsterVerde from '@/assets/drinks/monster-verde.png';
import paulaner from '@/assets/drinks/paulaner.png';
import petroni from '@/assets/drinks/petroni.png';
import sprite from '@/assets/drinks/sprite.png';
import vinoCopa from '@/assets/drinks/vino-copa.png';
import vinoBlanco from '@/assets/drinks/vino-blanco.png';
import zumoNaranja from '@/assets/drinks/zumo-naranja.png';
import jarraCerveza from '@/assets/drinks/jarra-cerveza.png';
import jarraTintoVerano from '@/assets/drinks/jarra-tinto-verano.png';
import jarraLadronManzanas from '@/assets/drinks/jarra-ladron-manzanas.png';

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const MATCHERS: Array<{ test: RegExp; src: string }> = [
  { test: /absolut.*sprite|sprite.*absolut/, src: absolutSprite },
  { test: /absolut.*vodka|vodka.*absolut/, src: absolutVodka },
  { test: /agua|mineral/, src: agua },
  { test: /appletiser/, src: appletiser },
  { test: /aquarius/, src: aquarius },
  { test: /bacardi.*(coca|cola|coke)|(coca|cola|coke).*bacardi/, src: bacardiCocacola },
  { test: /ballantine/, src: ballantines },
  { test: /batido/, src: batido },
  { test: /beefeater.*0[,.]?0|0[,.]?0.*beefeater|beefeater.*sin alcohol|sin alcohol.*beefeater/, src: beefeater00 },
  { test: /beefeater/, src: beefeater },
  { test: /cafe|cortado|solo|americano|capuccino|capuchino|descafeinado/, src: cafe },
  { test: /coca[\s-]?cola.*zero|zero.*coca[\s-]?cola|coca[\s-]?cola zero/, src: cocaColaZero },
  { test: /coca[\s-]?cola/, src: cocaCola },
  { test: /crema.*ruavieja|ruavieja.*crema|^ruavieja$/, src: cremaRuavieja },
  { test: /(jack.*daniel|\bjack\b).*(coca|cola|coke)|(coca|cola|coke).*(jack.*daniel|\bjack\b)/, src: jackDanielsCocacola },
  { test: /havana.*club/, src: havanaClub },
  { test: /monster.*mango.*loco|mango.*loco.*monster/, src: monsterMangoLoco },
  { test: /monster.*(verde|original|green|energy)|^monster$/, src: monsterVerde },
  { test: /paulaner/, src: paulaner },
  { test: /petroni|aperitivo.*naranja|spritz/, src: petroni },
  { test: /\bsprite\b/, src: sprite },
  { test: /vino.*blanco|blanco.*vino|verdejo|sauvignon|albarino|chardonnay/, src: vinoBlanco },
  { test: /tinto de verano|ladron de verano/, src: jarraTintoVerano },
  { test: /ladron.*manzana|manzana.*ladron|cider/, src: jarraLadronManzanas },
  { test: /vino.*tinto|vino.*rosado|ribera|rioja|rosado|copa de vino|^vino$/, src: vinoCopa },
  { test: /zumo|naranja exprimida/, src: zumoNaranja },
  { test: /monster.*blanco|monster.*ultra|ultra.*monster|monster.*zero/, src: monsterBlanco },
  { test: /fanta/, src: fantaNaranja },
  { test: /fuze\s*tea|fuzetea/, src: fuzetea },
  { test: /heineken.*0[,.]?0|0[,.]?0.*heineken|heineken.*sin alcohol|sin alcohol.*heineken/, src: heineken00 },
  { test: /desperados/, src: desperados },
  { test: /cruzcampo.*sin gluten|sin gluten.*cruzcampo/, src: botellinCruzcampo },
  { test: /botellin.*cruzcampo|cruzcampo.*botellin/, src: botellinCruzcampo },
  { test: /infusion|te caliente|manzanilla|poleo|tila/, src: infusion },
  // Catch-all cerveza (excluye ladrón de manzanas y tinto de verano)
  { test: /^(?!.*manzana)(?!.*tinto de verano).*(cerveza|cana|jarra|estrella|mahou|amstel|alhambra|san miguel|cruzcampo|radler|clara|rubia|tostada|negra|\bipa\b|lager|pilsner|weiss|weizen)/, src: jarraCerveza },
];

export function getDrinkImage(name: string, fotoUrl?: string | null) {
  const normalized = normalize(name);
  const matched = MATCHERS.find((entry) => entry.test.test(normalized));
  return matched?.src ?? fotoUrl ?? null;
}


