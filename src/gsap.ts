import gsap from 'gsap';
import { Draggable } from 'gsap/Draggable';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(Draggable, Flip, Observer, ScrollToPlugin, ScrollTrigger);

export { Draggable, Flip, Observer, ScrollToPlugin, ScrollTrigger, gsap };
