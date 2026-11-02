import { memo, useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'

import SubTitle from '../../components/SubTitle'
import Slider, { type SliderProps } from '../../components/Slider'
import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import { applyAudioEffect, AUDIO_EFFECT_PRESETS, type AudioEffectPreset } from '@/core/audioEffect'
import { audioEffectModule, parseEqualizerInfo } from '@/utils/nativeModules/audioEffect'

const PRESETS: Array<{ id: AudioEffectPreset, labelKey: string }> = [
  { id: 'off', labelKey: 'setting_audio_effect_preset_off' },
  { id: 'vocal', labelKey: 'setting_audio_effect_preset_vocal' },
  { id: 'bass', labelKey: 'setting_audio_effect_preset_bass' },
  { id: 'surround', labelKey: 'setting_audio_effect_preset_surround' },
  { id: 'live', labelKey: 'setting_audio_effect_preset_live' },
  { id: 'electronic', labelKey: 'setting_audio_effect_preset_electronic' },
  { id: 'rock', labelKey: 'setting_audio_effect_preset_rock' },
  { id: 'folk', labelKey: 'setting_audio_effect_preset_folk' },
  { id: 'classical', labelKey: 'setting_audio_effect_preset_classical' },
  { id: 'jazz', labelKey: 'setting_audio_effect_preset_jazz' },
  { id: 'cinema', labelKey: 'setting_audio_effect_preset_cinema' },
  { id: 'hall', labelKey: 'setting_audio_effect_preset_hall' },
  { id: 'custom', labelKey: 'setting_audio_effect_preset_custom' },
]

const REVERBS: Array<{ id: string, labelKey: string }> = [
  { id: 'none', labelKey: 'setting_audio_effect_reverb_none' },
  { id: 'smallroom', labelKey: 'setting_audio_effect_reverb_smallroom' },
  { id: 'mediumroom', labelKey: 'setting_audio_effect_reverb_mediumroom' },
  { id: 'largeroom', labelKey: 'setting_audio_effect_reverb_largeroom' },
  { id: 'mediumhall', labelKey: 'setting_audio_effect_reverb_mediumhall' },
  { id: 'largehall', labelKey: 'setting_audio_effect_reverb_largehall' },
  { id: 'plate', labelKey: 'setting_audio_effect_reverb_plate' },
]

/**
 * 音效设置（1.18.0）
 *
 * 12 组调音预设 + 自定义均衡器，覆盖人声 / 低音 / 环绕 / 现场 / 电子 / 摇滚 /
 * 民谣 / 古典 / 爵士 / 影院 / 音乐厅，另加「响度增强」，
 * 组合方式与主流音乐 App 的听感增强一致。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const preset = useSettingValue('player.audioEffectPreset')
  const bass = useSettingValue('player.audioEffectBass')
  const virtualizer = useSettingValue('player.audioEffectVirtualizer')
  const reverb = useSettingValue('player.audioEffectReverb')
  const eq = useSettingValue('player.audioEffectEq')
  const loudness = useSettingValue('player.audioEffectLoudness')

  const [eqInfo, setEqInfo] = useState<{ bands: number, minLevel: number, maxLevel: number, centers: number[] } | null>(null)
  const [localBass, setLocalBass] = useState(bass)
  const [localVirtualizer, setLocalVirtualizer] = useState(virtualizer)
  const [localLoudness, setLocalLoudness] = useState(loudness)
  const [localEq, setLocalEq] = useState<number[]>(eq)

  useEffect(() => {
    void audioEffectModule.getEqualizerInfo().then((raw) => {
      const info = parseEqualizerInfo(raw)
      if (!info) return
      const centers: number[] = []
      for (let i = 0; i < info.bands; i++) centers.push(info.bandsRaw[i * 2])
      setEqInfo({ bands: info.bands, minLevel: info.minLevel, maxLevel: info.maxLevel, centers })
      setLocalEq(prev => prev.length ? prev : new Array(info.bands).fill(0))
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreset = (id: AudioEffectPreset) => {
    updateSetting({ 'player.audioEffectPreset': id })
    if (id != 'custom' && id != 'off') {
      const config = AUDIO_EFFECT_PRESETS[id]
      setLocalBass(config.bass)
      setLocalVirtualizer(config.virtualizer)
      setLocalLoudness(Math.round(config.loudness / 9))
    }
    void applyAudioEffect().then(() => {
      if (id != 'off') toast(t('setting_audio_effect_applied'))
    })
  }

  const handleBassComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    updateSetting({ 'player.audioEffectBass': value, 'player.audioEffectPreset': 'custom' })
    void audioEffectModule.setBassBoost(value).catch(() => {})
  }, [])

  const handleVirtualizerComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    updateSetting({ 'player.audioEffectVirtualizer': value, 'player.audioEffectPreset': 'custom' })
    void audioEffectModule.setVirtualizer(value).catch(() => {})
  }, [])

  const handleLoudnessComplete = useCallback<NonNullable<SliderProps['onSlidingComplete']>>(value => {
    updateSetting({ 'player.audioEffectLoudness': value, 'player.audioEffectPreset': 'custom' })
    void audioEffectModule.setLoudnessGain(value * 9).catch(() => {})
  }, [])

  const handleReverb = (id: string) => {
    updateSetting({ 'player.audioEffectReverb': id, 'player.audioEffectPreset': 'custom' })
    void audioEffectModule.setReverb(id).catch(() => {})
  }

  const handleEqComplete = useCallback((value: number, index: number) => {
    setLocalEq(prev => {
      const next = prev.length ? [...prev] : new Array(eqInfo?.bands ?? 0).fill(0)
      next[index] = value
      updateSetting({ 'player.audioEffectEq': next, 'player.audioEffectPreset': 'custom' })
      void audioEffectModule.setBandLevel(index, value).catch(() => {})
      return next
    })
  }, [eqInfo])

  const handleResetEq = () => {
    if (!eqInfo) return
    const next = new Array(eqInfo.bands).fill(0) as number[]
    setLocalEq(next)
    updateSetting({ 'player.audioEffectEq': next, 'player.audioEffectPreset': 'custom' })
    next.forEach((level, index) => {
      void audioEffectModule.setBandLevel(index, level).catch(() => {})
    })
  }

  const labelForFreq = (hz: number) => hz >= 1000 ? `${Math.round(hz / 1000)}k` : `${Math.round(hz)}`
  const activePreset = PRESETS.find(item => item.id == preset)
  const isCustom = preset == 'custom'

  return (
    <SubTitle title={t('setting_audio_effect')}>
      <View style={styles.content}>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_audio_effect_tip')}</Text>

        <View style={styles.presetGrid}>
          {PRESETS.map(item => {
            const active = preset == item.id
            return (
              <CommonButton
                key={item.id}
                onPress={() => { handlePreset(item.id) }}
                style={[
                  styles.presetBtn,
                  { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] },
                ]}
              >
                <Text
                  size={12}
                  color={active ? theme['c-primary-font'] : theme['c-button-font']}
                  numberOfLines={1}
                >
                  {t(item.labelKey as Parameters<typeof t>[0])}
                </Text>
              </CommonButton>
            )
          })}
        </View>

        <Text size={11} color={theme['c-font-label']} style={styles.current}>
          {t('setting_audio_effect_current')}: {activePreset ? t(activePreset.labelKey as Parameters<typeof t>[0]) : preset}
        </Text>

        <Text size={13} color={theme['c-600']} style={styles.sliderLabel}>{t('setting_audio_effect_bass')}</Text>
        <View style={styles.sliderRow}>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={localBass}
            onValueChange={setLocalBass}
            onSlidingComplete={handleBassComplete}
          />
          <Text size={12} color={theme['c-font-label']} style={styles.sliderValue}>{localBass}</Text>
        </View>

        <Text size={13} color={theme['c-600']} style={styles.sliderLabel}>{t('setting_audio_effect_virtualizer')}</Text>
        <View style={styles.sliderRow}>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={localVirtualizer}
            onValueChange={setLocalVirtualizer}
            onSlidingComplete={handleVirtualizerComplete}
          />
          <Text size={12} color={theme['c-font-label']} style={styles.sliderValue}>{localVirtualizer}</Text>
        </View>

        <Text size={13} color={theme['c-600']} style={styles.sliderLabel}>{t('setting_audio_effect_loudness')}</Text>
        <View style={styles.sliderRow}>
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={localLoudness}
            onValueChange={setLocalLoudness}
            onSlidingComplete={handleLoudnessComplete}
          />
          <Text size={12} color={theme['c-font-label']} style={styles.sliderValue}>{localLoudness}</Text>
        </View>

        <Text size={13} color={theme['c-600']} style={styles.sliderLabel}>{t('setting_audio_effect_reverb')}</Text>
        <View style={styles.presetBtns}>
          {REVERBS.map(item => {
            const active = reverb == item.id
            return (
              <CommonButton
                key={item.id}
                onPress={() => { handleReverb(item.id) }}
                style={[styles.reverbBtn, { backgroundColor: active ? theme['c-primary-background-active'] : theme['c-button-background'] }]}
              >
                <Text size={11} color={active ? theme['c-primary-font'] : theme['c-button-font']}>{t(item.labelKey as Parameters<typeof t>[0])}</Text>
              </CommonButton>
            )
          })}
        </View>

        {
          eqInfo != null && (
            <>
              <View style={styles.eqHeader}>
                <Text size={13} color={theme['c-600']}>{t('setting_audio_effect_eq')}</Text>
                <CommonButton onPress={handleResetEq} style={[styles.resetBtn, { backgroundColor: theme['c-button-background'] }]}>
                  <Text size={11} color={theme['c-button-font']}>{t('setting_audio_effect_reset')}</Text>
                </CommonButton>
              </View>
              {
                Array.from({ length: eqInfo.bands }, (_, i) => {
                  const value = localEq[i] ?? 0
                  return (
                    <View key={i} style={styles.eqRow}>
                      <Text size={11} color={theme['c-font-label']} style={styles.eqFreq}>{labelForFreq(eqInfo.centers[i] ?? 0)}</Text>
                      <Slider
                        minimumValue={eqInfo.minLevel}
                        maximumValue={eqInfo.maxLevel}
                        step={50}
                        value={value}
                        onSlidingComplete={v => { handleEqComplete(v, i) }}
                      />
                      <Text size={11} color={theme['c-font-label']} style={styles.eqValue}>{(value / 100).toFixed(0)}dB</Text>
                    </View>
                  )
                })
              }
              {isCustom ? <Text size={10} color={theme['c-font-label']} style={styles.eqTip}>{t('setting_audio_effect_custom_tip')}</Text> : null}
            </>
          )
        }
      </View>
    </SubTitle>
  )
})

const styles = createStyle({
  content: {
    paddingLeft: 25,
    paddingRight: 15,
    paddingTop: 5,
    paddingBottom: 15,
  },
  tip: {
    lineHeight: 16,
    marginBottom: 8,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 2,
  },
  presetBtn: {
    width: '30.5%',
    minWidth: 72,
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 7,
    paddingBottom: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  presetBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  reverbBtn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
  current: {
    marginTop: 8,
    marginBottom: 2,
  },
  sliderLabel: {
    marginTop: 10,
    marginBottom: 2,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sliderValue: {
    width: 34,
    textAlign: 'right',
  },
  eqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 4,
  },
  resetBtn: {
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 4,
  },
  eqRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eqFreq: {
    width: 34,
  },
  eqValue: {
    width: 40,
    textAlign: 'right',
  },
  eqTip: {
    marginTop: 4,
    lineHeight: 14,
  },
})
