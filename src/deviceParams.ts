// from https://github.com/gluon/AbletonLive12_MIDIRemoteScripts/blob/main/_Generic/Devices.py

const RCK_BANK1 = [
  'Macro 1',
  'Macro 2',
  'Macro 3',
  'Macro 4',
  'Macro 5',
  'Macro 6',
  'Macro 7',
  'Macro 8',
]
const RCK_BANK2 = [
  'Macro 9',
  'Macro 10',
  'Macro 11',
  'Macro 12',
  'Macro 13',
  'Macro 14',
  'Macro 15',
  'Macro 16',
]
const RCK_BANKS = [RCK_BANK1, RCK_BANK2]
const RCK_BOBS = [RCK_BANK1]
const RCK_BNK_NAMES = ['Macros', 'Macros 2']
const ALG_BANK1 = [
  'OSC1 Level',
  'OSC1 Octave',
  'OSC1 Semi',
  'OSC1 Shape',
  'OSC2 Level',
  'OSC2 Octave',
  'OSC2 Semi',
  'OSC2 Shape',
]
const ALG_BANK2 = [
  'OSC1 Balance',
  'F1 Freq',
  'F1 Resonance',
  'F1 Type',
  'OSC2 Balance',
  'F2 Freq',
  'F2 Resonance',
  'F2 Type',
]
const ALG_BANK3 = [
  'FEG1 Attack',
  'FEG1 Decay',
  'FEG1 Sustain',
  'FEG1 Rel',
  'FEG2 Attack',
  'FEG2 Decay',
  'FEG2 Sustain',
  'FEG2 Rel',
]
const ALG_BANK4 = [
  'F1 On/Off',
  'F1 Freq < LFO',
  'F1 Freq < Env',
  'F1 Res < LFO',
  'F2 On/Off',
  'F2 Freq < LFO',
  'F2 Freq < Env',
  'F2 Res < LFO',
]
const ALG_BANK5 = [
  'AEG1 Attack',
  'AEG1 Decay',
  'AEG1 Sustain',
  'AEG1 Rel',
  'AEG2 Attack',
  'AEG2 Decay',
  'AEG2 Sustain',
  'AEG2 Rel',
]
const ALG_BANK6 = [
  'AMP1 Level',
  'AMP1 Pan',
  'LFO1 Shape',
  'LFO1 Speed',
  'AMP2 Level',
  'AMP2 Pan',
  'LFO2 Shape',
  'LFO2 Speed',
]
const ALG_BANK7 = [
  'Volume',
  'Noise On/Off',
  'Noise Level',
  'Noise Color',
  'Unison On/Off',
  'Unison Detune',
  'Vib On/Off',
  'Vib Amount',
]
const ALG_BOB = [
  'F1 Freq',
  'F1 Resonance',
  'OSC1 Shape',
  'OSC1 Octave',
  'OSC2 Shape',
  'OSC2 Octave',
  'OSC2 Detune',
  'Volume',
]
const ALG_BANKS = [
  ALG_BANK1,
  ALG_BANK2,
  ALG_BANK3,
  ALG_BANK4,
  ALG_BANK5,
  ALG_BANK6,
  ALG_BANK7,
]
const ALG_BOBS = [ALG_BOB]
const ALG_BNK_NAMES = [
  'Oscillators',
  'Filters',
  'Filter Envelopes',
  'Filter Modulation',
  'Volume Envelopes',
  'Mix',
  'Output',
]
const COL_BANK1 = [
  'Mallet On/Off',
  'Mallet Volume',
  'Mallet Noise Amount',
  'Mallet Stiffness',
  'Mallet Noise Color',
  '',
  '',
  '',
]
const COL_BANK2 = [
  'Noise Volume',
  'Noise Filter Type',
  'Noise Filter Freq',
  'Noise Filter Q',
  'Noise Attack',
  'Noise Decay',
  'Noise Sustain',
  'Noise Release',
]
const COL_BANK3 = [
  'Res 1 Decay',
  'Res 1 Material',
  'Res 1 Type',
  'Res 1 Quality',
  'Res 1 Tune',
  'Res 1 Fine Tune',
  'Res 1 Pitch Env.',
  'Res 1 Pitch Env. Time',
]
const COL_BANK4 = [
  'Res 1 Listening L',
  'Res 1 Listening R',
  'Res 1 Hit',
  'Res 1 Brightness',
  'Res 1 Inharmonics',
  'Res 1 Radius',
  'Res 1 Opening',
  'Res 1 Ratio',
]
const COL_BANK5 = [
  'Res 2 Decay',
  'Res 2 Material',
  'Res 2 Type',
  'Res 2 Quality',
  'Res 2 Tune',
  'Res 2 Fine Tune',
  'Res 2 Pitch Env.',
  'Res 2 Pitch Env. Time',
]
const COL_BANK6 = [
  'Res 2 Listening L',
  'Res 2 Listening R',
  'Res 2 Hit',
  'Res 2 Brightness',
  'Res 2 Inharmonics',
  'Res 2 Radius',
  'Res 2 Opening',
  'Res 2 Ratio',
]
const COL_BOB = [
  'Res 1 Brightness',
  'Res 1 Type',
  'Mallet Stiffness',
  'Mallet Noise Amount',
  'Res 1 Inharmonics',
  'Res 1 Decay',
  'Res 1 Tune',
  'Volume',
]
const COL_BANKS = [
  COL_BANK1,
  COL_BANK2,
  COL_BANK3,
  COL_BANK4,
  COL_BANK5,
  COL_BANK6,
]
const COL_BOBS = [COL_BOB]
const COL_BNK_NAMES = [
  'Mallet',
  'Noise',
  'Resonator 1, Set A',
  'Resonator 1, Set B',
  'Resonator 2, Set A',
  'Resonator 2, Set B',
]
const ELC_BANK1 = [
  'M Stiffness',
  'M Force',
  'Noise Pitch',
  'Noise Decay',
  'Noise Amount',
  'F Tine Color',
  'F Tine Decay',
  'F Tine Vol',
]
const ELC_BANK2 = [
  'F Tone Decay',
  'F Tone Vol',
  'F Release',
  'Damp Tone',
  'Damp Balance',
  'Damp Amount',
  '',
  '',
]
const ELC_BANK3 = [
  'P Symmetry',
  'P Distance',
  'P Amp In',
  'P Amp Out',
  'Pickup Model',
  '',
  '',
  '',
]
const ELC_BANK4 = [
  'M Stiff < Vel',
  'M Stiff < Key',
  'M Force < Vel',
  'M Force < Key',
  'Noise < Key',
  'F Tine < Key',
  'P Amp < Key',
  '',
]
const ELC_BANK5 = [
  'Volume',
  'Voices',
  'Semitone',
  'Detune',
  'KB Stretch',
  'PB Range',
  'Note PB Range',
  '',
]
const ELC_BOB = [
  'M Stiffness',
  'M Force',
  'Noise Amount',
  'F Tine Vol',
  'F Tone Vol',
  'F Release',
  'P Symmetry',
  'Volume',
]
const ELC_BANKS = [ELC_BANK1, ELC_BANK2, ELC_BANK3, ELC_BANK4, ELC_BANK5]
const ELC_BOBS = [ELC_BOB]
const ELC_BNK_NAMES = [
  'Mallet and Tine',
  'Tone and Damper',
  'Pickup',
  'Modulation',
  'Global',
]
const IMP_BANK1 = [
  '1 Start',
  '1 Transpose',
  '1 Stretch Factor',
  '1 Saturator Drive',
  '1 Filter Freq',
  '1 Filter Res',
  '1 Pan',
  '1 Volume',
]
const IMP_BANK2 = [
  '2 Start',
  '2 Transpose',
  '2 Stretch Factor',
  '2 Saturator Drive',
  '2 Filter Freq',
  '2 Filter Res',
  '2 Pan',
  '2 Volume',
]
const IMP_BANK3 = [
  '3 Start',
  '3 Transpose',
  '3 Stretch Factor',
  '3 Saturator Drive',
  '3 Filter Freq',
  '3 Filter Res',
  '3 Pan',
  '3 Volume',
]
const IMP_BANK4 = [
  '4 Start',
  '4 Transpose',
  '4 Stretch Factor',
  '4 Saturator Drive',
  '4 Filter Freq',
  '4 Filter Res',
  '4 Pan',
  '4 Volume',
]
const IMP_BANK5 = [
  '5 Start',
  '5 Transpose',
  '5 Stretch Factor',
  '5 Saturator Drive',
  '5 Filter Freq',
  '5 Filter Res',
  '5 Pan',
  '5 Volume',
]
const IMP_BANK6 = [
  '6 Start',
  '6 Transpose',
  '6 Stretch Factor',
  '6 Saturator Drive',
  '6 Filter Freq',
  '6 Filter Res',
  '6 Pan',
  '6 Volume',
]
const IMP_BANK7 = [
  '7 Start',
  '7 Transpose',
  '7 Stretch Factor',
  '7 Saturator Drive',
  '7 Filter Freq',
  '7 Filter Res',
  '7 Pan',
  '7 Volume',
]
const IMP_BANK8 = [
  '8 Start',
  '8 Transpose',
  '8 Stretch Factor',
  '8 Saturator Drive',
  '8 Filter Freq',
  '8 Filter Res',
  '8 Pan',
  '8 Volume',
]
const IMP_BOB = [
  'Global Time',
  'Global Transpose',
  '1 Transpose',
  '2 Transpose',
  '3 Transpose',
  '4 Transpose',
  '5 Transpose',
  '6 Transpose',
]
const IMP_BANKS = [
  IMP_BANK1,
  IMP_BANK2,
  IMP_BANK3,
  IMP_BANK4,
  IMP_BANK5,
  IMP_BANK6,
  IMP_BANK7,
  IMP_BANK8,
]
const IMP_BOBS = [IMP_BOB]
const IMP_BNK_NAMES = [
  'Pad 1',
  'Pad 2',
  'Pad 3',
  'Pad 4',
  'Pad 5',
  'Pad 6',
  'Pad 7',
  'Pad 8',
]
const OPR_BANK1 = [
  'Ae Attack',
  'Ae Decay',
  'Ae Sustain',
  'Ae Release',
  'A Coarse',
  'A Fine',
  'Osc-A Lev < Vel',
  'Osc-A Level',
]
const OPR_BANK2 = [
  'Be Attack',
  'Be Decay',
  'Be Sustain',
  'Be Release',
  'B Coarse',
  'B Fine',
  'Osc-B Lev < Vel',
  'Osc-B Level',
]
const OPR_BANK3 = [
  'Ce Attack',
  'Ce Decay',
  'Ce Sustain',
  'Ce Release',
  'C Coarse',
  'C Fine',
  'Osc-C Lev < Vel',
  'Osc-C Level',
]
const OPR_BANK4 = [
  'De Attack',
  'De Decay',
  'De Sustain',
  'De Release',
  'D Coarse',
  'D Fine',
  'Osc-D Lev < Vel',
  'Osc-D Level',
]
const OPR_BANK5 = [
  'Le Attack',
  'Le Decay',
  'Le Sustain',
  'Le Release',
  'LFO Rate',
  'LFO Amt',
  'LFO Type',
  'LFO R < K',
]
const OPR_BANK6 = [
  'Fe Attack',
  'Fe Decay',
  'Fe Sustain',
  'Fe Release',
  'Filter Freq',
  'Filter Res',
  'Fe R < Vel',
  'Fe Amount',
]
const OPR_BANK7 = [
  'Pe Attack',
  'Pe Decay',
  'Pe Sustain',
  'Pe Release',
  'Pe Init',
  'Glide Time',
  'Pe Amount',
  'Spread',
]
const OPR_BANK8 = [
  'Time < Key',
  'Panorama',
  'Pan < Key',
  'Pan < Rnd',
  'Algorithm',
  'Time',
  'Tone',
  'Volume',
]
const OPR_BOB = [
  'Filter Freq',
  'Filter Res',
  'A Coarse',
  'A Fine',
  'B Coarse',
  'B Fine',
  'Osc-B Level',
  'Volume',
]
const OPR_BANKS = [
  OPR_BANK1,
  OPR_BANK2,
  OPR_BANK3,
  OPR_BANK4,
  OPR_BANK5,
  OPR_BANK6,
  OPR_BANK7,
  OPR_BANK8,
]
const OPR_BOBS = [OPR_BOB]
const OPR_BNK_NAMES = [
  'Oscillator A',
  'Oscillator B',
  'Oscillator C',
  'Oscillator D',
  'LFO',
  'Filter',
  'Pitch Modulation',
  'Routing',
]
const SAM_BANK1 = [
  'Volume',
  'Ve Attack',
  'Ve Decay',
  'Ve Sustain',
  'Ve Release',
  'Vol < Vel',
  'Ve R < Vel',
  'Time',
]
const SAM_BANK2 = [
  'Filter Type',
  'Filter Morph',
  'Filter Freq',
  'Filter Res',
  'Filt < Vel',
  'Filt < Key',
  'Fe < Env',
  'Shaper Amt',
]
const SAM_BANK3 = [
  'Fe Attack',
  'Fe Decay',
  'Fe Sustain',
  'Fe Release',
  'Fe End',
  'Fe Mode',
  'Fe Loop',
  'Fe Retrig',
]
const SAM_BANK4 = [
  'L 1 Wave',
  'L 1 Sync',
  'L 1 Sync Rate',
  'L 1 Rate',
  'Vol < LFO',
  'Filt < LFO',
  'Pan < LFO',
  'Pitch < LFO',
]
const SAM_BANK5 = [
  'L 2 Wave',
  'L 2 Sync',
  'L 2 Sync Rate',
  'L 2 Rate',
  'L 2 R < Key',
  'L 2 St Mode',
  'L 2 Spin',
  'L 2 Phase',
]
const SAM_BANK6 = [
  'L 3 Wave',
  'L 3 Sync',
  'L 3 Sync Rate',
  'L 3 Rate',
  'L 3 R < Key',
  'L 3 St Mode',
  'L 3 Spin',
  'L 3 Phase',
]
const SAM_BANK7 = [
  'O Mode',
  'O Volume',
  'O Coarse',
  'O Fine',
  'Oe Attack',
  'Oe Decay',
  'Oe Sustain',
  'Oe Release',
]
const SAM_BANK8 = [
  'Transpose',
  'Spread',
  'Pe < Env',
  'Pe Attack',
  'Pe Peak',
  'Pe Decay',
  'Pe Sustain',
  'Pe Release',
]
const SAM_BOB = [
  'Filter Freq',
  'Filter Res',
  'Fe < Env',
  'Fe Decay',
  'Ve Attack',
  'Ve Release',
  'Transpose',
  'Volume',
]
const SAM_BANKS = [
  SAM_BANK1,
  SAM_BANK2,
  SAM_BANK3,
  SAM_BANK4,
  SAM_BANK5,
  SAM_BANK6,
  SAM_BANK7,
  SAM_BANK8,
]
const SAM_BOBS = [SAM_BOB]
const SAM_BNK_NAMES = [
  'Volume',
  'Filter',
  'Filter Envelope',
  'LFO 1',
  'LFO 2',
  'LFO 3',
  'Oscillator',
  'Pitch',
]
const SIM_BANK1 = [
  'Ve Attack',
  'Ve Decay',
  'Ve Sustain',
  'Ve Release',
  'S Start',
  'S Loop Length',
  'S Length',
  'S Loop Fade',
]
const SIM_BANK2 = [
  'Fe Attack',
  'Fe Decay',
  'Fe Sustain',
  'Fe Release',
  'Filter Freq',
  'Filter Res',
  'Filt < Vel',
  'Fe < Env',
]
const SIM_BANK3 = [
  'L Attack',
  'L Rate',
  'L R < Key',
  'L Wave',
  'Vol < LFO',
  'Filt < LFO',
  'Pitch < LFO',
  'Pan < LFO',
]
const SIM_BANK4 = [
  'Pe Attack',
  'Pe Decay',
  'Pe Sustain',
  'Pe Release',
  'Glide Time',
  'Spread',
  'Pan',
  'Volume',
]
const SIM_BOB = [
  'Filter Freq',
  'Filter Res',
  'S Start',
  'S Length',
  'Ve Attack',
  'Ve Release',
  'Transpose',
  'Volume',
]
const SIM_BANKS = [SIM_BANK1, SIM_BANK2, SIM_BANK3, SIM_BANK4]
const SIM_BOBS = [SIM_BOB]
const SIM_BNK_NAMES = ['Amplitude', 'Filter', 'LFO', 'Pitch Modifiers']
const TNS_BANK1 = [
  'Exciter Type',
  'String Decay',
  'Str Inharmon',
  'Str Damping',
  'Exc ForceMassProt',
  'Exc FricStiff',
  'Exc Velocity',
  'E Pos',
]
const TNS_BANK2 = [
  'Damper On',
  'Damper Mass',
  'D Stiffness',
  'D Velocity',
  'Damp Pos',
  'D Damping',
  'D Pos < Vel',
  'D Pos Abs',
]
const TNS_BANK3 = [
  'Term On/Off',
  'Term Mass',
  'Term Fng Stiff',
  'Term Fret Stiff',
  'Pickup On/Off',
  'Pickup Pos',
  'T Mass < Vel',
  'T Mass < Key',
]
const TNS_BANK4 = [
  'Body On/Off',
  'Body Type',
  'Body Size',
  'Body Decay',
  'Body Low-Cut',
  'Body High-Cut',
  'Body Mix',
  'Volume',
]
const TNS_BANK5 = [
  'Vibrato On/Off',
  'Vib Delay',
  'Vib Fade-In',
  'Vib Speed',
  'Vib Amount',
  'Vib < ModWh',
  'Vib Error',
  'Volume',
]
const TNS_BANK6 = [
  'Filter On/Off',
  'Filter Type',
  'Filter Freq',
  'Filter Reso',
  'Freq < Env',
  'Freq < LFO',
  'Reso < Env',
  'Reso < LFO',
]
const TNS_BANK7 = [
  'FEG On/Off',
  'FEG Attack',
  'FEG Decay',
  'FEG Sustain',
  'FEG Release',
  'LFO On/Off',
  'LFO Shape',
  'LFO Speed',
]
const TNS_BANK8 = [
  'Unison On/Off',
  'Uni Detune',
  'Porta On/Off',
  'Porta Time',
  'Voices',
  'Octave',
  'Semitone',
  'Volume',
]
const TNS_BOB = [
  'Filter Freq',
  'Filter Reso',
  'Filter Type',
  'Exciter Type',
  'E Pos',
  'String Decay',
  'Str Damping',
  'Volume',
]
const TNS_BANKS = [
  TNS_BANK1,
  TNS_BANK2,
  TNS_BANK3,
  TNS_BANK4,
  TNS_BANK5,
  TNS_BANK6,
  TNS_BANK7,
  TNS_BANK8,
]
const TNS_BOBS = [TNS_BOB]
const TNS_BNK_NAMES = [
  'Exciter and String',
  'Damper',
  'Termination and Pickup',
  'Body',
  'Vibrato',
  'Filter',
  'Envelope and LFO',
  'Global',
]
const WVT_BANK1 = [
  'Osc 1 Transp',
  'Osc 1 Detune',
  'Osc 1 Pos',
  'Osc 1 Effect 1',
  'Osc 1 Effect 2',
  'Osc 1 Pan',
  'Osc 1 Gain',
  'Osc 1 On',
]
const WVT_BANK2 = [
  'Osc 2 Transp',
  'Osc 2 Detune',
  'Osc 2 Pos',
  'Osc 2 Effect 1',
  'Osc 2 Effect 2',
  'Osc 2 Pan',
  'Osc 2 Gain',
  'Osc 2 On',
]
const WVT_BANK3 = [
  'Filter 1 On',
  'Filter 1 Freq',
  'Filter 1 Res',
  'Filter 1 Drive',
  'Filter 1 Type',
  'Filter 1 Slope',
  'Filter 1 LP/HP',
  'Filter 1 BP/NO/Morph',
]
const WVT_BANK4 = [
  'Filter 2 On',
  'Filter 2 Freq',
  'Filter 2 Res',
  'Filter 2 Drive',
  'Filter 2 Type',
  'Filter 2 Slope',
  'Filter 2 LP/HP',
  'Filter 2 BP/NO/Morph',
]
const WVT_BANK5 = [
  'Amp Attack',
  'Amp Decay',
  'Amp Sustain',
  'Amp Release',
  'Amp A Slope',
  'Amp D Slope',
  'Amp R Slope',
  'Amp Loop Mode',
]
const WVT_BANK6 = [
  'Env 2 Attack',
  'Env 2 Decay',
  'Env 2 Sustain',
  'Env 2 Release',
  'Env 3 Attack',
  'Env 3 Decay',
  'Env 3 Sustain',
  'Env 3 Release',
]
const WVT_BANK7 = [
  'LFO 1 Amount',
  'LFO 1 Rate',
  'LFO 1 S. Rate',
  'LFO 1 Sync',
  'LFO 2 Amount',
  'LFO 2 Rate',
  'LFO 2 S. Rate',
  'LFO 2 Sync',
]
const WVT_BANK8 = [
  'Time',
  'Global Mod Amount',
  'Unison Amount',
  'Transpose',
  'Glide',
  'Sub Gain',
  'Sub Transpose',
  'Volume',
]
const WVT_BOB = [
  'Osc 1 Pos',
  'Osc 1 Transp',
  'Osc 2 Pos',
  'Osc 2 Transp',
  'Filter 1 Freq',
  'Filter 1 Res',
  'Global Mod Amount',
  'Volume',
]
const WVT_BANKS = [
  WVT_BANK1,
  WVT_BANK2,
  WVT_BANK3,
  WVT_BANK4,
  WVT_BANK5,
  WVT_BANK6,
  WVT_BANK7,
  WVT_BANK8,
]
const WVT_BOBS = [WVT_BOB]
const WVT_BANK_NAMES = [
  'Oscillator 1',
  'Oscillator 2',
  'Filter 1',
  'Filter 2',
  'Amp Envelope',
  'Envelope 2/3',
  'LFO 1/2',
  'Global',
]
const ARP_BANK1 = [
  'Style',
  'Groove',
  'Offset',
  'Synced Rate',
  'Retrigger Mode',
  'Ret. Interval',
  'Repeats',
  'Gate',
]
const ARP_BANK2 = [
  'Tranpose Mode',
  'Tranpose Key',
  'Transp. Steps',
  'Transp. Dist.',
  'Velocity Decay',
  'Velocity Target',
  'Velocity On',
  'Vel. Retrigger',
]
const ARP_BOB = [
  'Synced Rate',
  'Free Rate',
  'Transp. Steps',
  'Transp. Dist.',
  'Gate',
  'Tranpose Key',
  'Velocity Decay',
  'Velocity Target',
]
const ARP_BANKS = [ARP_BANK1, ARP_BANK2]
const ARP_BOBS = [ARP_BOB]
const ARP_BNK_NAMES = ['Style', 'Pitch/Velocity']
const CRD_BANK1 = [
  'Shift1',
  'Shift2',
  'Shift3',
  'Shift4',
  'Shift5',
  'Shift6',
  '',
  '',
]
const CRD_BANK2 = [
  'Velocity1',
  'Velocity2',
  'Velocity3',
  'Velocity4',
  'Velocity5',
  'Velocity6',
  '',
  '',
]
const CRD_BOB = [
  'Shift1',
  'Shift2',
  'Shift3',
  'Shift4',
  'Shift5',
  'Velocity5',
  'Shift6',
  'Velocity6',
]
const CRD_BANKS = [CRD_BANK1, CRD_BANK2]
const CRD_BOBS = [CRD_BOB]
const CRD_BNK_NAMES = ['Shift', 'Shift %']
const NTL_BANK1 = [
  'Sync On',
  'Time Length',
  'Synced Length',
  'Gate',
  'Release Velocity',
  'Decay Time',
  'Decay Key Scale',
  'Latch',
]
const NTL_BANKS = [NTL_BANK1]
const NTL_BOBS = [NTL_BANK1]
const PIT_BANK1 = ['Pitch', 'Range', 'Lowest', '', '', '', '', '']
const PIT_BANKS = [PIT_BANK1]
const PIT_BOBS = [PIT_BANK1]
const RND_BANK1 = ['Chance', 'Choices', 'Interval', 'Sign', '', '', '', '']
const RND_BANKS = [RND_BANK1]
const RND_BOBS = [RND_BANK1]
const SCL_BANK1 = ['Base', 'Transpose', 'Range', 'Lowest', '', '', '', '']
const SCL_BANKS = [SCL_BANK1]
const SCL_BOBS = [SCL_BANK1]
const VEL_BANK1 = [
  'Drive',
  'Compand',
  'Random',
  'Mode',
  'Out Hi',
  'Out Low',
  'Range',
  'Lowest',
]
const VEL_BANKS = [VEL_BANK1]
const VEL_BOBS = [VEL_BANK1]
const AMP_BANK1 = [
  'Amp Type',
  'Bass',
  'Middle',
  'Treble',
  'Presence',
  'Gain',
  'Volume',
  'Dry/Wet',
]
const AMP_BANK2 = ['Dual Mono', '', '', '', '', '', '', '']
const AMP_BANKS = [AMP_BANK1, AMP_BANK2]
const AMP_BOBS = [AMP_BANK1]
const AMP_BNK_NAMES = ['Global', 'Dual Mono']
const AFL_BANK1 = [
  'Frequency',
  'Resonance',
  'Env. Attack',
  'Env. Release',
  'Env. Modulation',
  'LFO Amount',
  'LFO Frequency',
  'LFO Phase',
]
const AFL_BANK2 = [
  'Filter Type',
  'LFO Quantize On',
  'LFO Quantize Rate',
  'LFO Stereo Mode',
  'LFO Spin',
  'LFO Sync',
  'LFO Sync Rate',
  'LFO Offset',
]
const AFL_BANK3 = ['', '', '', '', '', 'S/C On', 'S/C Mix', 'S/C Gain']
const AFL_BOB = [
  'Frequency',
  'Resonance',
  'Filter Type',
  'Env. Modulation',
  'LFO Amount',
  'LFO Waveform',
  'LFO Frequency',
  'LFO Phase',
]
const AFL_BANKS = [AFL_BANK1, AFL_BANK2, AFL_BANK3]
const AFL_BOBS = [AFL_BOB]
const AFL_BNK_NAMES = ['Filter', 'Filter Extra', 'Side Chain']
const APN_BANK1 = [
  'Frequency',
  'Phase',
  'Shape',
  'Waveform',
  'Sync Rate',
  'Offset',
  'Width [Random]',
  'Amount',
]
const APN_BANKS = [APN_BANK1]
const APN_BOBS = [APN_BANK1]
const BRP_BANK1 = [
  'Interval',
  'Offset',
  'Grid',
  'Variation',
  'Filter Freq',
  'Filter Width',
  'Volume',
  'Decay',
]
const BRP_BANK2 = [
  'Chance',
  'Gate',
  'Pitch',
  'Pitch Decay',
  'Filter Freq',
  'Filter Width',
  'Volume',
  'Decay',
]
const BRP_BOB = [
  'Grid',
  'Interval',
  'Offset',
  'Gate',
  'Pitch',
  'Pitch Decay',
  'Variation',
  'Chance',
]
const BRP_BANKS = [BRP_BANK1, BRP_BANK2]
const BRP_BOBS = [BRP_BOB]
const BRP_BNK_NAMES = ['Repeat Rate', 'Gate/Pitch']
const CAB_BANK1 = [
  'Cabinet Type',
  'Microphone Position',
  'Microphone Type',
  'Dual Mono',
  '',
  '',
  '',
  'Dry/Wet',
]
const CAB_BANKS = [CAB_BANK1]
const CAB_BOBS = [CAB_BANK1]
const CHR_BANK1 = [
  'LFO Amount',
  'LFO Rate',
  'Delay 1 Time',
  'Delay 1 HiPass',
  'Delay 2 Time',
  'Delay 2 Mode',
  'Feedback',
  'Dry/Wet',
]
const CHR_BANKS = [CHR_BANK1]
const CHR_BOBS = [CHR_BANK1]
const CP3_BANK1 = [
  'Threshold',
  'Ratio',
  'Attack',
  'Release',
  'Auto Release On/Off',
  'Env Mode',
  'Knee',
  'Model',
]
const CP3_BANK2 = [
  'Threshold',
  'Expansion Ratio',
  'LookAhead',
  'S/C Listen',
  'S/C Gain',
  'Makeup',
  'Dry/Wet',
  'Output Gain',
]
const CP3_BANK3 = [
  'S/C EQ On',
  'S/C EQ Type',
  'S/C EQ Freq',
  'S/C EQ Q',
  'S/C EQ Gain',
  'S/C On',
  'S/C Mix',
  'S/C Gain',
]
const CP3_BOB = [
  'Threshold',
  'Ratio',
  'Attack',
  'Release',
  'Model',
  'Knee',
  'Dry/Wet',
  'Output Gain',
]
const CP3_BANKS = [CP3_BANK1, CP3_BANK2, CP3_BANK3]
const CP3_BOBS = [CP3_BOB]
const CP3_BNK_NAMES = ['Compression', 'Output', 'Side Chain']
const CRP_BANK1 = [
  'Decay',
  'Material',
  'Mid Freq',
  'Width',
  'Bleed',
  'Resonance Type',
  'Gain',
  'Dry Wet',
]
const CRP_BANK2 = [
  'Listening L',
  'Listening R',
  'Hit',
  'Brightness',
  'Inharmonics',
  'Radius',
  'Opening',
  'Ratio',
]
const CRP_BANK3 = [
  'Resonance Type',
  'Tune',
  'Transpose',
  'Fine',
  'Spread',
  'Resonator Quality',
  'Note Off',
  'Off Decay',
]
const CRP_BOB = [
  'Brightness',
  'Resonance Type',
  'Material',
  'Inharmonics',
  'Decay',
  'Ratio',
  'Tune',
  'Dry Wet',
]
const CRP_BANKS = [CRP_BANK1, CRP_BANK2, CRP_BANK3]
const CRP_BOBS = [CRP_BOB]
const CRP_BNK_NAMES = ['Amount', 'Body', 'Tune']
const DRB_BANK1 = [
  'Drive',
  'Drive Type',
  'Transients',
  'Crunch',
  'Boom Freq',
  'Boom Amt',
  'Boom Decay',
  'Boom Audition',
]
const DRB_BANK2 = [
  'Trim',
  'Output Gain',
  'Dry/Wet',
  'Compressor On',
  'Damping Freq',
  '',
  '',
  '',
]
const DRB_BOB = [
  'Drive',
  'Drive Type',
  'Crunch',
  'Boom Amt',
  'Trim',
  'Damping Freq',
  'Output Gain',
  'Dry/Wet',
]
const DRB_BANKS = [DRB_BANK1, DRB_BANK2]
const DRB_BOBS = [DRB_BOB]
const DRB_BANK_NAMES = ['Drive', 'Gain']
const DTB_BANK1 = [
  'Drive',
  'Bias',
  'Envelope',
  'Tone',
  'Attack',
  'Release',
  'Output',
  'Dry/Wet',
]
const DTB_BANKS = [DTB_BANK1]
const DTB_BOBS = [DTB_BANK1]
const ECH_BANK1 = [
  'L Division',
  'R Division',
  'L Sync Mode',
  'R Sync Mode',
  'L 16th',
  'R 16th',
  'L Sync',
  'R Sync',
]
const ECH_BANK2 = [
  'L Time',
  'R Time',
  'L Offset',
  'R Offset',
  'Link',
  'Channel Mode',
  '',
  '',
]
const ECH_BANK3 = [
  'Gate On',
  'Gate Thr',
  'Gate Release',
  'Duck On',
  'Duck Thr',
  'Duck Release',
  'Env Mix',
  '',
]
const ECH_BANK4 = [
  'Noise On',
  'Noise Amt',
  'Noise Mrph',
  'Wobble On',
  'Wobble Amt',
  'Wobble Mrph',
  'Repitch',
  '',
]
const ECH_BANK5 = [
  'Feedback',
  'Feedback Inv',
  'Input Gain',
  'Output Gain',
  'Clip Dry',
  'Dry Wet',
  '',
  '',
]
const ECH_BANK6 = [
  'Filter On',
  'HP Freq',
  'HP Res',
  'LP Freq',
  'LP Res',
  '',
  '',
  '',
]
const ECH_BANK7 = [
  'Reverb Level',
  'Reverb Decay',
  'Reverb Loc',
  'Stereo Width',
  '',
  '',
  '',
  '',
]
const ECH_BANK8 = [
  'Mod Wave',
  'Mod Sync',
  'Mod Rate',
  'Mod Freq',
  'Mod Phase',
  'Dly < Mod',
  'Flt < Mod',
  'Mod 4x',
]
const ECH_BOB = [
  'L Division',
  'R Division',
  'L Time',
  'R Time',
  'Input Gain',
  'Feedback',
  'Stereo Width',
  'Dry Wet',
]
const ECH_BANKS = [
  ECH_BANK1,
  ECH_BANK2,
  ECH_BANK3,
  ECH_BANK4,
  ECH_BANK5,
  ECH_BANK6,
  ECH_BANK7,
  ECH_BANK8,
]
const ECH_BOBS = [ECH_BOB]
const ECH_BANK_NAMES = [
  'Sync',
  'Time',
  'Gate/Ducking',
  'Noise/Wobble',
  'Gain',
  'Filter',
  'Reverb',
  'Modulation',
]
const EQ8_BANK1 = [
  '1 Filter On A',
  '2 Filter On A',
  '3 Filter On A',
  '4 Filter On A',
  '5 Filter On A',
  '6 Filter On A',
  '7 Filter On A',
  '8 Filter On A',
]
const EQ8_BANK2 = [
  '1 Frequency A',
  '2 Frequency A',
  '3 Frequency A',
  '4 Frequency A',
  '5 Frequency A',
  '6 Frequency A',
  '7 Frequency A',
  '8 Frequency A',
]
const EQ8_BANK3 = [
  '1 Gain A',
  '2 Gain A',
  '3 Gain A',
  '4 Gain A',
  '5 Gain A',
  '6 Gain A',
  '7 Gain A',
  '8 Gain A',
]
const EQ8_BANK4 = [
  '1 Resonance A',
  '2 Resonance A',
  '3 Resonance A',
  '4 Resonance A',
  '5 Resonance A',
  '6 Resonance A',
  '7 Resonance A',
  '8 Resonance A',
]
const EQ8_BANK5 = [
  '1 Filter Type A',
  '2 Filter Type A',
  '3 Filter Type A',
  '4 Filter Type A',
  '5 Filter Type A',
  '6 Filter Type A',
  '7 Filter Type A',
  '8 Filter Type A',
]
const EQ8_BANK6 = ['Adaptive Q', '', '', '', '', '', 'Scale', 'Output Gain']
const EQ8_BANK7 = [
  '3 Gain A',
  '3 Frequency A',
  '3 Resonance A',
  '4 Gain A',
  '4 Frequency A',
  '4 Resonance A',
  '5 Gain A',
  '5 Frequency A',
]
const EQ8_BOB = [
  '1 Frequency A',
  '1 Gain A',
  '2 Frequency A',
  '2 Gain A',
  '3 Frequency A',
  '3 Gain A',
  '4 Frequency A',
  '4 Gain A',
]
const EQ8_BANKS = [
  EQ8_BANK1,
  EQ8_BANK2,
  EQ8_BANK3,
  EQ8_BANK4,
  EQ8_BANK5,
  EQ8_BANK6,
  EQ8_BANK7,
]
const EQ8_BOBS = [EQ8_BOB]
const EQ8_BNK_NAMES = [
  'Band On/Off',
  'Frequency',
  'Gain',
  'Resonance',
  'Filter Type',
  'Output',
  'EQs 3-5',
]
const EQ3_BANK1 = [
  'GainLo',
  'GainMid',
  'GainHi',
  'FreqLo',
  'LowOn',
  'MidOn',
  'HighOn',
  'FreqHi',
]
const EQ3_BANKS = [EQ3_BANK1]
const EQ3_BOBS = [EQ3_BANK1]
const ERO_BANK1 = ['Frequency', 'Width', 'Mode', 'Amount', '', '', '', '']
const ERO_BANKS = [ERO_BANK1]
const ERO_BOBS = [ERO_BANK1]
const FLD_BANK1 = [
  '1 Filter Freq',
  '1 Filter Width',
  '1 Beat Delay',
  '1 Beat Swing',
  '1 Feedback',
  '1 Pan',
  '1 Volume',
  'Dry',
]
const FLD_BANK2 = [
  '2 Filter Freq',
  '2 Filter Width',
  '2 Beat Delay',
  '2 Beat Swing',
  '2 Feedback',
  '2 Pan',
  '2 Volume',
  'Dry',
]
const FLD_BANK3 = [
  '3 Filter Freq',
  '3 Filter Width',
  '3 Beat Delay',
  '3 Beat Swing',
  '3 Feedback',
  '3 Pan',
  '3 Volume',
  'Dry',
]
const FLD_BOB = [
  '2 Filter Freq',
  '2 Filter Width',
  '2 Beat Delay',
  '2 Feedback',
  '1 Volume',
  '3 Volume',
  '2 Volume',
  'Dry',
]
const FLD_BANKS = [FLD_BANK1, FLD_BANK2, FLD_BANK3]
const FLD_BOBS = [FLD_BOB]
const FLD_BNK_NAMES = ['Input L Filter', 'Input L+R Filter', 'Input R Filter']
const FLG_BANK1 = [
  'Hi Pass',
  'Dry/Wet',
  'Delay Time',
  'Feedback',
  'Env. Modulation',
  'Env. Attack',
  'Env. Release',
  '',
]
const FLG_BANK2 = [
  'LFO Amount',
  'Frequency',
  'LFO Phase',
  'Sync',
  'LFO Offset',
  'Sync Rate',
  'LFO Width [Random]',
  'LFO Waveform',
]
const FLG_BOB = [
  'Hi Pass',
  'Delay Time',
  'Frequency',
  'Sync Rate',
  'LFO Amount',
  'Env. Modulation',
  'Feedback',
  'Dry/Wet',
]
const FLG_BANKS = [FLG_BANK1, FLG_BANK2]
const FLG_BOBS = [FLG_BOB]
const FLG_BNK_NAMES = ['Frequency Controls', 'LFO / S&H']
const FRS_BANK1 = [
  'Coarse',
  'Fine',
  'Mode',
  'Ring Mod Frequency',
  'Drive On/Off',
  'Drive',
  'Wide',
  'Dry/Wet',
]
const FRS_BANKS = [FRS_BANK1]
const FRS_BOBS = [FRS_BANK1]
const GTE_BANK1 = [
  'Threshold',
  'Return',
  'FlipMode',
  'LookAhead',
  'Attack',
  'Hold',
  'Release',
  'Floor',
]
const GTE_BANK2 = [
  'S/C EQ On',
  'S/C EQ Type',
  'S/C EQ Freq',
  'S/C EQ Q',
  'S/C EQ Gain',
  'S/C On',
  'S/C Mix',
  'S/C Gain',
]
const GTE_BANKS = [GTE_BANK1, GTE_BANK2]
const GTE_BOBS = [GTE_BANK1]
const GTE_BNK_NAMES = ['Gate', 'Side Chain']
const GLU_BANK1 = [
  'Threshold',
  'Ratio',
  'Attack',
  'Release',
  'Peak Clip In',
  'Range',
  'Dry/Wet',
  'Makeup',
]
const GLU_BANK2 = [
  'S/C EQ On',
  'S/C EQ Type',
  'S/C EQ Freq',
  'S/C EQ Q',
  'S/C EQ Gain',
  'S/C On',
  'S/C Mix',
  'S/C Gain',
]
const GLU_BOB = [
  'Threshold',
  'Ratio',
  'Attack',
  'Release',
  'Peak Clip In',
  'Range',
  'Makeup',
  'Dry/Wet',
]
const GLU_BANKS = [GLU_BANK1, GLU_BANK2]
const GLU_BOBS = [GLU_BOB]
const GLU_BNK_NAMES = ['Compression', 'Side Chain']
const GRD_BANK1 = [
  'Frequency',
  'Pitch',
  'Time Delay',
  'Beat Swing',
  'Random',
  'Spray',
  'Feedback',
  'DryWet',
]
const GRD_BANKS = [GRD_BANK1]
const GRD_BOBS = [GRD_BANK1]
const LPR_BANK1 = [
  'State',
  'Speed',
  'Reverse',
  'Quantization',
  'Monitor',
  'Song Control',
  'Tempo Control',
  'Feedback',
]
const LPR_BANKS = [LPR_BANK1]
const LPR_BOBS = [LPR_BANK1]
const MBD_BANK1 = [
  'Master Output',
  'Amount',
  'Time Scaling',
  'Soft Knee On/Off',
  'Peak/RMS Mode',
  'Band Activator [High]',
  'Band Activator [Mid]',
  'Band Activator [Low]',
]
const MBD_BANK2 = [
  'Input Gain [Low]',
  'Below Threshold [Low]',
  'Below Ratio [Low]',
  'Above Threshold [Low]',
  'Above Ratio [Low]',
  'Attack Time [Low]',
  'Release Time [Low]',
  'Output Gain [Low]',
]
const MBD_BANK3 = [
  'Input Gain [Mid]',
  'Below Threshold [Mid]',
  'Below Ratio [Mid]',
  'Above Threshold [Mid]',
  'Above Ratio [Mid]',
  'Attack Time [Mid]',
  'Release Time [Mid]',
  'Output Gain [Mid]',
]
const MBD_BANK4 = [
  'Input Gain [High]',
  'Below Threshold [High]',
  'Below Ratio [High]',
  'Above Threshold [High]',
  'Above Ratio [High]',
  'Attack Time [High]',
  'Release Time [High]',
  'Output Gain [High]',
]
const MBD_BANK5 = [
  'Low-Mid Crossover',
  'Mid-High Crossover',
  '',
  '',
  '',
  '',
  '',
  '',
]
const MBD_BANK6 = ['', '', '', '', '', 'S/C On', 'S/C Mix', 'S/C Gain']
const MBD_BOB = [
  'Above Threshold [Low]',
  'Above Ratio [Low]',
  'Above Threshold [Mid]',
  'Above Ratio [Mid]',
  'Above Threshold [High]',
  'Above Ratio [High]',
  'Master Output',
  'Amount',
]
const MBD_BANKS = [
  MBD_BANK1,
  MBD_BANK2,
  MBD_BANK3,
  MBD_BANK4,
  MBD_BANK5,
  MBD_BANK6,
]
const MBD_BOBS = [MBD_BOB]
const MBD_BNK_NAMES = [
  'Global',
  'Low Band',
  'Mid Band',
  'High Band',
  'Split Frequencies',
  'Side Chain',
]
const OVR_BANK1 = [
  'Filter Freq',
  'Filter Width',
  'Drive',
  'Tone',
  'Preserve Dynamics',
  '',
  '',
  'Dry/Wet',
]
const OVR_BANKS = [OVR_BANK1]
const OVR_BOBS = [OVR_BANK1]
const PDL_BANK1 = [
  'Type',
  'Gain',
  'Output',
  'Bass',
  'Mid',
  'Treble',
  'Sub',
  'Dry/Wet',
]
const PDL_BANK2 = ['Mid Freq', '', '', '', '', '', '', '']
const PDL_BANKS = [PDL_BANK1, PDL_BANK2]
const PDL_BOBS = [PDL_BANK1]
const PDL_BANK_NAMES = ['General', 'Eq']
const PHS_BANK1 = [
  'Poles',
  'Color',
  'Dry/Wet',
  'Frequency',
  'Env. Modulation',
  'Env. Attack',
  'Env. Release',
  'Feedback',
]
const PHS_BANK2 = [
  'LFO Amount',
  'LFO Frequency',
  'LFO Phase',
  'LFO Sync',
  'LFO Offset',
  'LFO Sync Rate',
  'LFO Spin',
  'LFO Waveform',
]
const PHS_BOB = [
  'Frequency',
  'Feedback',
  'Poles',
  'Env. Modulation',
  'Color',
  'LFO Amount',
  'LFO Frequency',
  'Dry/Wet',
]
const PHS_BANKS = [PHS_BANK1, PHS_BANK2]
const PHS_BOBS = [PHS_BOB]
const PHS_BNK_NAMES = ['Frequency Controls', 'LFO / S&H']
const PPG_BANK1 = [
  'Filter Freq',
  'Filter Width',
  'Time Delay',
  'Beat Delay',
  'Beat Swing',
  'Delay Mode',
  'Feedback',
  'Dry/Wet',
]
const PPG_BANKS = [PPG_BANK1]
const PPG_BOBS = [PPG_BANK1]
const RDX_BANK1 = [
  'Bit Depth',
  'Sample Mode',
  'Sample Hard',
  'Sample Soft',
  'Bit On',
  '',
  '',
  '',
]
const RDX_BANKS = [RDX_BANK1]
const RDX_BOBS = [RDX_BANK1]
const RSN_BANK1 = [
  'Frequency',
  'Width',
  'Global Gain',
  'Dry/Wet',
  'Decay',
  'I Note',
  'Color',
  'I Gain',
]
const RSN_BANK2 = [
  'II Gain',
  'III Gain',
  'IV Gain',
  'V Gain',
  'II Pitch',
  'III Pitch',
  'IV Pitch',
  'V Pitch',
]
const RSN_BOB = [
  'Decay',
  'I Note',
  'II Pitch',
  'III Pitch',
  'IV Pitch',
  'V Pitch',
  'Global Gain',
  'Dry/Wet',
]
const RSN_BANKS = [RSN_BANK1, RSN_BANK2]
const RSN_BOBS = [RSN_BOB]
const RSN_BNK_NAMES = ['General / Mode I', 'Modes II-IV']
const RVB_BANK1 = [
  'In Filter Freq',
  'In Filter Width',
  'Predelay',
  'ER Spin On',
  'ER Spin Rate',
  'ER Spin Amount',
  'ER Shape',
  'Decay Time',
]
const RVB_BANK2 = [
  'HiFilter Freq',
  'LowShelf Freq',
  'Chorus Rate',
  'Diffusion',
  'HiShelf Gain',
  'LowShelf Gain',
  'Chorus Amount',
  'Scale',
]
const RVB_BANK3 = [
  'Decay Time',
  'Freeze On',
  'Room Size',
  'Stereo Image',
  'Reflect Level',
  'Diffuse Level',
  'Dry/Wet',
  'Density',
]
const RVB_BOB = [
  'Decay Time',
  'Room Size',
  'Predelay',
  'In Filter Freq',
  'Reflect Level',
  'Diffuse Level',
  'Stereo Image',
  'Dry/Wet',
]
const RVB_BANKS = [RVB_BANK1, RVB_BANK2, RVB_BANK3]
const RVB_BOBS = [RVB_BOB]
const RVB_BNK_NAMES = ['Reflections', 'Diffusion Network', 'Global']
const SAT_BANK1 = [
  'Drive',
  'Base',
  'Frequency',
  'Width',
  'Depth',
  'Output',
  'Dry/Wet',
  'Type',
]
const SAT_BANK2 = [
  'WS Drive',
  'WS Lin',
  'WS Curve',
  'WS Damp',
  'WS Depth',
  'WS Period',
  'Dry/Wet',
  '',
]
const SAT_BOB = [
  'Drive',
  'Type',
  'Base',
  'Frequency',
  'Width',
  'Depth',
  'Output',
  'Dry/Wet',
]
const SAT_BANKS = [SAT_BANK1, SAT_BANK2]
const SAT_BOBS = [SAT_BOB]
const SAT_BNK_NAMES = ['General Controls', 'Waveshaper Controls']
const SMD_BANK1 = [
  'L Beat Delay',
  'L Beat Swing',
  'L Time Delay',
  'R Beat Delay',
  'R Beat Swing',
  'R Time Delay',
  'Feedback',
  'Dry/Wet',
]
const SMD_BANKS = [SMD_BANK1]
const SMD_BOBS = [SMD_BANK1]
const UTL_BANK1 = [
  'Left Inv',
  'Right Inv',
  'Channel Mode',
  'Stereo Width',
  'Mono',
  'Balance',
  'Gain',
  'Mute',
]
const UTL_BANK2 = ['Bass Mono', 'Bass Freq', 'DC Filter', '', '', '', '', '']
const UTL_BANKS = [UTL_BANK1, UTL_BANK2]
const UTL_BOBS = [UTL_BANK1]
const UTL_BNK_NAMES = ['General Controls', 'Low Frequency']
const VDS_BANK1 = [
  'Tracing Freq.',
  'Tracing Width',
  'Tracing Drive',
  'Crackle Density',
  'Pinch Freq.',
  'Pinch Width',
  'Pinch Drive',
  'Crackle Volume',
]
const VDS_BANKS = [VDS_BANK1]
const VDS_BOBS = [VDS_BANK1]
const VOC_BANK1 = [
  'Formant Shift',
  'Attack Time',
  'Release Time',
  'Mono/Stereo',
  'Output Level',
  'Gate Threshold',
  'Envelope Depth',
  'Dry/Wet',
]
const VOC_BANK2 = [
  'Filter Bandwidth',
  'Upper Filter Band',
  'Lower Filter Band',
  'Precise/Retro',
  'Unvoiced Level',
  'Unvoiced Sensitivity',
  'Unvoiced Speed',
  'Enhance',
]
const VOC_BANK3 = [
  'Noise Rate',
  'Noise Crackle',
  'Upper Pitch Detection',
  'Lower Pitch Detection',
  'Oscillator Pitch',
  'Oscillator Waveform',
  'Ext. In Gain',
  '',
]
const VOC_BOB = [
  'Formant Shift',
  'Attack Time',
  'Release Time',
  'Unvoiced Level',
  'Gate Threshold',
  'Filter Bandwidth',
  'Envelope Depth',
  'Dry/Wet',
]
const VOC_BANKS = [VOC_BANK1, VOC_BANK2, VOC_BANK3]
const VOC_BOBS = [VOC_BOB]
const VOC_BNK_NAMES = ['Global', 'Filters/Voicing', 'Carrier']

export const DEVICE_DICT: Record<string, string[][]> = {
  //AudioEffectGroupDevice: RCK_BANKS,
  //MidiEffectGroupDevice: RCK_BANKS,
  //InstrumentGroupDevice: RCK_BANKS,
  //DrumGroupDevice: RCK_BANKS,
  InstrumentImpulse: IMP_BANKS,
  Operator: OPR_BANKS,
  UltraAnalog: ALG_BANKS,
  OriginalSimpler: SIM_BANKS,
  MultiSampler: SAM_BANKS,
  MidiArpeggiator: ARP_BANKS,
  LoungeLizard: ELC_BANKS,
  StringStudio: TNS_BANKS,
  Collision: COL_BANKS,
  MidiChord: CRD_BANKS,
  MidiNoteLength: NTL_BANKS,
  MidiPitcher: PIT_BANKS,
  MidiRandom: RND_BANKS,
  MidiScale: SCL_BANKS,
  MidiVelocity: VEL_BANKS,
  AutoFilter: AFL_BANKS,
  AutoPan: APN_BANKS,
  BeatRepeat: BRP_BANKS,
  Chorus: CHR_BANKS,
  Compressor2: CP3_BANKS,
  Corpus: CRP_BANKS,
  Eq8: EQ8_BANKS,
  FilterEQ3: EQ3_BANKS,
  Erosion: ERO_BANKS,
  FilterDelay: FLD_BANKS,
  Flanger: FLG_BANKS,
  FrequencyShifter: FRS_BANKS,
  GrainDelay: GRD_BANKS,
  Looper: LPR_BANKS,
  MultibandDynamics: MBD_BANKS,
  Overdrive: OVR_BANKS,
  Phaser: PHS_BANKS,
  Redux: RDX_BANKS,
  Saturator: SAT_BANKS,
  Resonator: RSN_BANKS,
  StereoGain: UTL_BANKS,
  Tube: DTB_BANKS,
  Reverb: RVB_BANKS,
  Vinyl: VDS_BANKS,
  Gate: GTE_BANKS,
  Vocoder: VOC_BANKS,
  Amp: AMP_BANKS,
  Cabinet: CAB_BANKS,
  GlueCompressor: GLU_BANKS,
  Pedal: PDL_BANKS,
  DrumBuss: DRB_BANKS,
  Echo: ECH_BANKS,
  InstrumentVector: WVT_BANKS,
}
export const DEVICE_BOB_DICT = {
  //AudioEffectGroupDevice: RCK_BOBS,
  //MidiEffectGroupDevice: RCK_BOBS,
  //InstrumentGroupDevice: RCK_BOBS,
  //DrumGroupDevice: RCK_BOBS,
  InstrumentImpulse: IMP_BOBS,
  Operator: OPR_BOBS,
  UltraAnalog: ALG_BOBS,
  OriginalSimpler: SIM_BOBS,
  MultiSampler: SAM_BOBS,
  MidiArpeggiator: ARP_BOBS,
  LoungeLizard: ELC_BOBS,
  StringStudio: TNS_BOBS,
  Collision: COL_BOBS,
  MidiChord: CRD_BOBS,
  MidiNoteLength: NTL_BOBS,
  MidiPitcher: PIT_BOBS,
  MidiRandom: RND_BOBS,
  MidiScale: SCL_BOBS,
  MidiVelocity: VEL_BOBS,
  AutoFilter: AFL_BOBS,
  AutoPan: APN_BOBS,
  BeatRepeat: BRP_BOBS,
  Chorus: CHR_BOBS,
  Compressor2: CP3_BOBS,
  Corpus: CRP_BOBS,
  Eq8: EQ8_BOBS,
  FilterEQ3: EQ3_BOBS,
  Erosion: ERO_BOBS,
  FilterDelay: FLD_BOBS,
  Flanger: FLG_BOBS,
  FrequencyShifter: FRS_BOBS,
  GrainDelay: GRD_BOBS,
  Looper: LPR_BOBS,
  MultibandDynamics: MBD_BOBS,
  Overdrive: OVR_BOBS,
  Phaser: PHS_BOBS,
  Redux: RDX_BOBS,
  Saturator: SAT_BOBS,
  Resonator: RSN_BOBS,
  StereoGain: UTL_BOBS,
  Tube: DTB_BOBS,
  Reverb: RVB_BOBS,
  Vinyl: VDS_BOBS,
  Gate: GTE_BOBS,
  Vocoder: VOC_BOBS,
  Amp: AMP_BOBS,
  Cabinet: CAB_BOBS,
  GlueCompressor: GLU_BOBS,
  Pedal: PDL_BOBS,
  DrumBuss: DRB_BOBS,
  Echo: ECH_BOBS,
  InstrumentVector: WVT_BOBS,
}
export const BANK_NAME_DICT: Record<string, string[]> = {
  //AudioEffectGroupDevice: RCK_BNK_NAMES,
  //MidiEffectGroupDevice: RCK_BNK_NAMES,
  //InstrumentGroupDevice: RCK_BNK_NAMES,
  //DrumGroupDevice: RCK_BNK_NAMES,
  InstrumentImpulse: IMP_BNK_NAMES,
  Operator: OPR_BNK_NAMES,
  UltraAnalog: ALG_BNK_NAMES,
  OriginalSimpler: SIM_BNK_NAMES,
  MultiSampler: SAM_BNK_NAMES,
  MidiArpeggiator: ARP_BNK_NAMES,
  LoungeLizard: ELC_BNK_NAMES,
  StringStudio: TNS_BNK_NAMES,
  Collision: COL_BNK_NAMES,
  MidiChord: CRD_BNK_NAMES,
  BeatRepeat: BRP_BNK_NAMES,
  Compressor2: CP3_BNK_NAMES,
  Corpus: CRP_BNK_NAMES,
  Eq8: EQ8_BNK_NAMES,
  FilterDelay: FLD_BNK_NAMES,
  Flanger: FLG_BNK_NAMES,
  Gate: GTE_BNK_NAMES,
  MultibandDynamics: MBD_BNK_NAMES,
  Phaser: PHS_BNK_NAMES,
  Saturator: SAT_BNK_NAMES,
  Resonator: RSN_BNK_NAMES,
  Reverb: RVB_BNK_NAMES,
  Vocoder: VOC_BNK_NAMES,
  Amp: AMP_BNK_NAMES,
  GlueCompressor: GLU_BNK_NAMES,
  AutoFilter: AFL_BNK_NAMES,
  StereoGain: UTL_BNK_NAMES,
  DrumBuss: DRB_BANK_NAMES,
  Echo: ECH_BANK_NAMES,
  Pedal: PDL_BANK_NAMES,
  InstrumentVector: WVT_BANK_NAMES,
}
export const MAX_DEVICES = [
  'MxDeviceInstrument',
  'MxDeviceAudioEffect',
  'MxDeviceMidiEffect',
]
