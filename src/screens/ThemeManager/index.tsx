import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, TextInput, TouchableOpacity, View } from 'react-native'
import Clipboard from '@react-native-clipboard/clipboard'
import RNFS from 'react-native-fs'

import PageContent from '@/components/PageContent'
import FullScreenHeader from '@/components/FullScreenHeader'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import FileSelect, { type FileSelectType } from '@/components/common/FileSelect'
import Section from '@/screens/Home/Views/Setting/components/Section'
import { setComponentId } from '@/core/common'
import { setTheme } from '@/core/theme'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast, confirmDialog } from '@/utils/tools'
import { getAllThemes, saveTheme, removeTheme, buildActiveThemeColors } from '@/theme/themes'
import { PRESET_COLORS, PRESET_BG_LIGHT, PRESET_BG_DARK, normalizeColor, toSolidRgba, buildTheme, parseTheme, THEME_FONTS } from '@/theme/themeEditor'
import { readFile, selectFile, writeFile, temporaryDirectoryPath, mkdir, extname, unlink } from '@/utils/fs'
import { resolveDownloadDirectory } from '@/core/download'
import { COMPONENT_IDS } from '@/config/constant'

type Mode = { type: 'list' } | { type: 'edit', theme: LX.Theme }

export default memo(({ componentId }: { componentId: string }) => {
  const t = useI18n()
  const theme = useTheme()
  const activeId = useSettingValue('theme.id')
  const [mode, setMode] = useState<Mode>({ type: 'list' })
  const [themes, setThemes] = useState<ReadonlyArray<{ id: string, name: string, isDark: boolean, color: string }>>([])
  const [userThemes, setUserThemes] = useState<LX.Theme[]>([])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.themeManager, componentId)
  }, [componentId])

  const reload = useCallback(() => {
    void getAllThemes().then((info) => {
      setThemes(info.themes.map(item => ({
        id: item.id,
        name: t(`theme_${item.id}`),
        isDark: item.isDark,
        color: item.config.themeColors['c-theme'],
      })))
      setUserThemes([...info.userThemes])
    })
  }, [t])

  useEffect(() => { reload() }, [reload])

  const handleImportFile = useCallback(() => {
    void selectFile({ extTypes: ['json'], toPath: `${temporaryDirectoryPath}/theme_import.json` }).then(async(file) => {
      if (!file?.data) return
      const filePath = (file.data as unknown as string) || ''
      if (!filePath) return
      try {
        const raw = await readFile(filePath, 'utf8') as string
        const imported = parseTheme(raw)
        await saveTheme(imported)
        // openDocument 会把文件复制到缓存目录，导入完成即清理，避免累积
        void unlink(filePath).catch(() => {})
        reload()
        toast(t('theme_import_success', { name: imported.name }))
      } catch {
        toast(t('theme_import_failed'), 'long')
      }
    }).catch(() => {
      toast(t('theme_import_failed'), 'long')
    })
  }, [reload, t])

  const handleImportClipboard = useCallback(() => {
    void Clipboard.getString().then(async(raw) => {
      if (!raw?.trim()) {
        toast(t('theme_import_empty'), 'long')
        return
      }
      try {
        const imported = parseTheme(raw)
        await saveTheme(imported)
        reload()
        toast(t('theme_import_success', { name: imported.name }))
      } catch {
        toast(t('theme_import_failed'), 'long')
      }
    })
  }, [reload, t])

  const handleExport = useCallback((item: LX.Theme) => {
    void resolveDownloadDirectory().then(async(dir) => {
      const name = item.name.replace(/[\\/:*?"<>|]/g, '_')
      const target = `${dir}/theme_${name}.json`
      await writeFile(target, JSON.stringify(item, null, 2), 'utf8')
      toast(t('theme_export_success', { path: target }), 'long')
    }).catch(() => {
      toast(t('theme_export_failed'), 'long')
    })
  }, [t])

  const handleDelete = useCallback((item: LX.Theme) => {
    void confirmDialog({
      message: t('theme_delete_confirm', { name: item.name }),
      bgClose: false,
    }).then(async(ok) => {
      if (!ok) return
      await removeTheme(item.id)
      if (activeId == item.id) setTheme('green')
      reload()
      toast(t('theme_delete_success'))
    })
  }, [activeId, reload, t])

  const handleCreate = useCallback(() => {
    const current = userThemes.find(item => item.id == activeId)
    const base = current ?? themes.find(item => item.id == activeId)
    const isDark = base?.isDark ?? false
    setMode({
      type: 'edit',
      theme: buildTheme({
        name: t('theme_new_name'),
        primary: PRESET_COLORS[0],
        background: isDark ? PRESET_BG_DARK[0] : PRESET_BG_LIGHT[0],
        isDark,
      }),
    })
  }, [activeId, themes, userThemes, t])

  if (mode.type == 'edit') {
    return (
      <ThemeEditor
        componentId={componentId}
        initial={mode.theme}
        onCancel={() => { setMode({ type: 'list' }) }}
        onSaved={(saved) => {
          reload()
          setMode({ type: 'list' })
          setTheme(saved.id)
        }}
      />
    )
  }

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={t('theme_manager_title')}
        right={
          <TouchableOpacity style={styles.headerBtn} onPress={handleCreate} activeOpacity={0.6}>
            <Icon name="add_folder" size={20} color={theme['c-font']} />
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Section title={t('theme_manager_builtin')}>
          <View style={styles.grid}>
            {themes.map(item => (
              <ThemeCard
                key={item.id}
                name={item.name}
                color={item.color}
                active={activeId == item.id}
                onPress={() => { setTheme(item.id) }}
              />
            ))}
          </View>
        </Section>

        <Section title={t('theme_manager_custom')}>
          {userThemes.length
            ? userThemes.map(item => (
                <View key={item.id} style={styles.row}>
                  <TouchableOpacity
                    style={styles.rowMain}
                    onPress={() => { setTheme(item.id) }}
                    activeOpacity={0.6}
                  >
                    <View style={[styles.dot, { backgroundColor: item.config.themeColors['c-theme'] }]} />
                    <Text size={14} numberOfLines={1} style={styles.rowName}>{item.name}</Text>
                    {activeId == item.id
                      ? <Icon name="checkbox-marked" size={16} color={theme['c-primary-font']} />
                      : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() => { setMode({ type: 'edit', theme: JSON.parse(JSON.stringify(item)) as LX.Theme }) }}
                    activeOpacity={0.6}
                  >
                    <Icon name="slider" size={17} color={theme['c-500']} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() => { handleExport(item) }}
                    activeOpacity={0.6}
                  >
                    <Icon name="download-2" size={17} color={theme['c-500']} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rowBtn}
                    onPress={() => { handleDelete(item) }}
                    activeOpacity={0.6}
                  >
                    <Icon name="close" size={17} color={theme['c-500']} />
                  </TouchableOpacity>
                </View>
            ))
            : <Text size={12} color={theme['c-font-label']} style={styles.empty}>{t('theme_manager_empty')}</Text>}
        </Section>

        <Section title={t('theme_manager_io')}>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={handleImportFile}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_import_file')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={handleImportClipboard}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_import_clipboard')}</Text>
            </TouchableOpacity>
          </View>
          <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('theme_io_tip')}</Text>
        </Section>
      </ScrollView>
    </PageContent>
  )
})

const ThemeCard = ({ name, color, active, onPress }: {
  name: string
  color: string
  active: boolean
  onPress: () => void
}) => {
  const theme = useTheme()
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.cardColor, { backgroundColor: color, borderColor: active ? color : 'transparent' }]} />
      <Text size={11} color={active ? theme['c-primary-font'] : theme['c-font-label']} numberOfLines={1} style={styles.cardName}>
        {name}
      </Text>
    </TouchableOpacity>
  )
}

const ThemeEditor = ({ componentId, initial, onCancel, onSaved }: {
  componentId: string
  initial: LX.Theme
  onCancel: () => void
  onSaved: (theme: LX.Theme) => void
}) => {
  const t = useI18n()
  const theme = useTheme()
  const [name, setName] = useState(initial.name)
  const [isDark, setIsDark] = useState(initial.isDark)
  const [primary, setPrimary] = useState(initial.config.themeColors['c-primary'])
  const [background, setBackground] = useState(
    toSolidRgba(initial.config.extInfo['c-main-background']) ??
    (initial.isDark ? PRESET_BG_DARK[0] : PRESET_BG_LIGHT[0]),
  )
  const [primaryInput, setPrimaryInput] = useState('')
  const [bgInput, setBgInput] = useState('')
  // 竖屏 / 横屏背景图与主题字体（1.22.11）
  const [portraitBg, setPortraitBg] = useState(initial.config.extInfo['bg-image-portrait'] ?? '')
  const [landscapeBg, setLandscapeBg] = useState(initial.config.extInfo['bg-image-landscape'] ?? '')
  const [fontFamily, setFontFamily] = useState(initial.config.extInfo['font-family'] ?? '')
  const [imagesDir, setImagesDir] = useState('')
  const fileSelectRef = useRef<FileSelectType>(null)
  const pickingTargetRef = useRef<'portrait' | 'landscape'>('portrait')

  useEffect(() => {
    void getAllThemes().then((info) => {
      setImagesDir(info.dataPath)
      void mkdir(info.dataPath).catch(() => {})
    })
  }, [])

  const preview = useMemo(() => {
    try {
      return buildActiveThemeColors(buildTheme({
        name, primary, background, isDark,
        extInfo: { 'bg-image-portrait': portraitBg, 'bg-image-landscape': landscapeBg, 'font-family': fontFamily },
      }))
    } catch {
      return theme
    }
  }, [name, primary, background, isDark, portraitBg, landscapeBg, fontFamily, theme])

  const applyPrimary = (value: string) => {
    const color = normalizeColor(value)
    if (!color) {
      toast(t('theme_color_invalid'), 'long')
      return
    }
    setPrimary(color)
    setPrimaryInput('')
  }

  const applyBackground = (value: string) => {
    const color = toSolidRgba(value)
    if (!color) {
      toast(t('theme_color_invalid'), 'long')
      return
    }
    setBackground(color)
    setBgInput('')
  }

  const handleSave = () => {
    if (!name.trim()) {
      toast(t('theme_name_required'), 'long')
      return
    }
    // 编辑已有主题时保留原 id 与原有扩展字段（如导入的网络背景图、徽章色），
    // c-app-background / c-main-background 由编辑器里的颜色重新生成，不继承
    const preserved = { ...initial.config.extInfo }
    delete preserved['c-app-background']
    delete preserved['c-main-background']
    const target = buildTheme({
      name: name.trim(),
      primary,
      background,
      isDark,
      extInfo: {
        ...preserved,
        'bg-image-portrait': portraitBg,
        'bg-image-landscape': landscapeBg,
        'font-family': fontFamily,
      },
    }, initial.id)
    void saveTheme(target).then(() => {
      toast(t('theme_save_success'))
      onSaved(target)
    }).catch(() => {
      toast(t('theme_save_failed'), 'long')
    })
  }

  // 选择竖屏 / 横屏背景图：复制到 theme_images 目录，extInfo 里只存文件名；
  // 换图时顺手删掉旧图，避免 theme_images 目录无限膨胀
  const pickBgImage = (target: 'portrait' | 'landscape') => {
    if (!imagesDir) {
      toast(t('theme_bg_set_failed'), 'long')
      return
    }
    pickingTargetRef.current = target
    fileSelectRef.current?.show(
      { title: t('theme_editor_select_image'), filter: ['jpg', 'jpeg', 'png', 'webp'] },
      async(path) => {
        if (!path || !imagesDir) return
        try {
          const oldName = target == 'portrait' ? portraitBg : landscapeBg
          const ext = extname(path) || 'jpg'
          const fileName = `bg_${target}_${Date.now()}.${ext}`
          await RNFS.copyFile(path, `${imagesDir}/${fileName}`)
          if (oldName && oldName != fileName) {
            void RNFS.unlink(`${imagesDir}/${oldName}`).catch(() => {})
          }
          if (target == 'portrait') setPortraitBg(fileName)
          else setLandscapeBg(fileName)
          toast(t('theme_bg_set_success'))
        } catch (error) {
          toast(`${t('theme_bg_set_failed')}: ${(error as Error).message}`, 'long')
        }
      },
    )
  }

  // 清除背景图：置空状态并删除已保存的图片文件
  const clearBgImage = (target: 'portrait' | 'landscape') => {
    const name = target == 'portrait' ? portraitBg : landscapeBg
    if (name && imagesDir) void RNFS.unlink(`${imagesDir}/${name}`).catch(() => {})
    if (target == 'portrait') setPortraitBg('')
    else setLandscapeBg('')
  }

  return (
    <PageContent>
      <FullScreenHeader
        componentId={componentId}
        title={t('theme_editor_title')}
        right={
          <TouchableOpacity style={styles.headerBtn} onPress={handleSave} activeOpacity={0.6}>
            <Text size={13} color={theme['c-primary-font']}>{t('theme_editor_save')}</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Section title={t('theme_editor_basic')}>
          <View style={styles.field}>
            <Text size={12} color={theme['c-600']}>{t('theme_editor_name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: theme['c-font'], backgroundColor: theme['c-primary-input-background'] }]}
              placeholderTextColor={theme['c-350']}
            />
          </View>
          <TouchableOpacity style={styles.darkRow} onPress={() => { setIsDark(!isDark) }} activeOpacity={0.6}>
            <Text size={13}>{t('theme_editor_dark')}</Text>
            <View style={[styles.switch, { backgroundColor: isDark ? theme['c-primary'] : theme['c-400'] }]}>
              <View style={[styles.switchDot, isDark ? styles.switchDotOn : null]} />
            </View>
          </TouchableOpacity>
        </Section>

        <Section title={t('theme_editor_primary')}>
          <View style={styles.swatches}>
            {PRESET_COLORS.map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.swatch, { backgroundColor: color, borderColor: primary == color ? theme['c-font'] : 'transparent' }]}
                onPress={() => { setPrimary(color) }}
                activeOpacity={0.7}
              />
            ))}
          </View>
          <View style={styles.field}>
            <Text size={12} color={theme['c-600']}>{t('theme_editor_custom_color')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={primaryInput}
                onChangeText={setPrimaryInput}
                onSubmitEditing={() => { applyPrimary(primaryInput) }}
                placeholder="#4daf7c"
                placeholderTextColor={theme['c-350']}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.inputFlex, { color: theme['c-font'], backgroundColor: theme['c-primary-input-background'] }]}
              />
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
                onPress={() => { applyPrimary(primaryInput) }}
                activeOpacity={0.7}
              >
                <Text size={12} color={theme['c-button-font']}>{t('theme_editor_apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        <Section title={t('theme_editor_background')}>
          <View style={styles.swatches}>
            {(isDark ? PRESET_BG_DARK : PRESET_BG_LIGHT).map(color => (
              <TouchableOpacity
                key={color}
                style={[styles.swatch, { backgroundColor: color, borderColor: background == color ? theme['c-font'] : theme['c-400'] }]}
                onPress={() => { setBackground(color) }}
                activeOpacity={0.7}
              />
            ))}
          </View>
          <View style={styles.field}>
            <Text size={12} color={theme['c-600']}>{t('theme_editor_custom_color')}</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={bgInput}
                onChangeText={setBgInput}
                onSubmitEditing={() => { applyBackground(bgInput) }}
                placeholder="#131313"
                placeholderTextColor={theme['c-350']}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.inputFlex, { color: theme['c-font'], backgroundColor: theme['c-primary-input-background'] }]}
              />
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
                onPress={() => { applyBackground(bgInput) }}
                activeOpacity={0.7}
              >
                <Text size={12} color={theme['c-button-font']}>{t('theme_editor_apply')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        <Section title={t('theme_editor_bg_image')}>
          <View style={styles.bgRow}>
            <Text size={12} color={theme['c-600']} style={styles.bgLabel}>{t('theme_editor_bg_portrait')}</Text>
            <Text size={11} color={theme['c-font-label']} numberOfLines={1} style={styles.bgName}>
              {portraitBg || '-'}
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={() => { pickBgImage('portrait') }}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_editor_select_image')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.bgClearBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={() => { clearBgImage('portrait') }}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_editor_clear_image')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bgRow}>
            <Text size={12} color={theme['c-600']} style={styles.bgLabel}>{t('theme_editor_bg_landscape')}</Text>
            <Text size={11} color={theme['c-font-label']} numberOfLines={1} style={styles.bgName}>
              {landscapeBg || '-'}
            </Text>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={() => { pickBgImage('landscape') }}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_editor_select_image')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.bgClearBtn, { backgroundColor: theme['c-button-background'] }]}
              onPress={() => { clearBgImage('landscape') }}
              activeOpacity={0.7}
            >
              <Text size={12} color={theme['c-button-font']}>{t('theme_editor_clear_image')}</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title={t('theme_editor_font')}>
          <View style={styles.swatches}>
            {THEME_FONTS.map(font => (
              <TouchableOpacity
                key={font.value || 'default'}
                style={[styles.fontBtn, { borderColor: fontFamily == font.value ? theme['c-font'] : theme['c-400'] }]}
                onPress={() => { setFontFamily(font.value) }}
                activeOpacity={0.7}
              >
                <Text size={12} style={{ fontFamily: font.fontFamily }} color={theme['c-font']}>{font.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        <Section title={t('theme_editor_preview')}>
          <View style={[styles.preview, { backgroundColor: preview['c-main-background'] }]}>
            <Text size={14} color={preview['c-font']} style={{ fontFamily: preview['c-font-family'] }}>{name || t('theme_editor_name')}</Text>
            <Text size={11} color={preview['c-font-label']} style={[styles.previewSub, { fontFamily: preview['c-font-family'] }]}>{t('theme_editor_preview_sub')}</Text>
            <View style={styles.previewRow}>
              <View style={[styles.previewBtn, { backgroundColor: preview['c-primary-background'] }]}>
                <Text size={11} color={preview['c-primary-font']}>{t('theme_editor_preview_btn')}</Text>
              </View>
              <View style={[styles.previewBtn, { backgroundColor: preview['c-primary'] }]}>
                <Text size={11} color={preview['c-button-font']}>{t('theme_editor_preview_btn')}</Text>
              </View>
            </View>
          </View>
        </Section>

        <TouchableOpacity
          style={[styles.actionBtn, styles.cancelBtn, { backgroundColor: theme['c-button-background'] }]}
          onPress={onCancel}
          activeOpacity={0.7}
        >
          <Text size={12} color={theme['c-button-font']}>{t('theme_editor_cancel')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <FileSelect ref={fileSelectRef} />
    </PageContent>
  )
}

const styles = createStyle({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  headerBtn: {
    minWidth: 44,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 8,
    paddingRight: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  card: {
    alignItems: 'center',
  },
  cardColor: {
    width: 46,
    height: 34,
    borderRadius: 5,
    borderWidth: 2,
  },
  cardName: {
    marginTop: 3,
    maxWidth: 60,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    paddingTop: 8,
    paddingBottom: 8,
  },
  rowMain: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowName: {
    flexGrow: 1,
    flexShrink: 1,
  },
  rowBtn: {
    width: 36,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  empty: {
    paddingLeft: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
  },
  actionBtn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  cancelBtn: {
    marginLeft: 16,
    marginTop: 12,
  },
  tip: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    lineHeight: 16,
  },
  field: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 5,
  },
  input: {
    height: 34,
    borderRadius: 4,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 13,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputFlex: {
    flexGrow: 1,
    flexShrink: 1,
  },
  darkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  switch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    paddingLeft: 2,
    paddingRight: 2,
  },
  switchDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
  },
  switchDotOn: {
    alignSelf: 'flex-end',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 6,
    borderWidth: 2,
  },
  preview: {
    marginLeft: 16,
    marginRight: 16,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.25)',
  },
  previewSub: {
    marginTop: 3,
  },
  previewRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  previewBtn: {
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 5,
    paddingBottom: 5,
    borderRadius: 4,
  },
  bgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  bgLabel: {
    minWidth: 58,
  },
  bgName: {
    flexGrow: 1,
    flexShrink: 1,
  },
  bgClearBtn: {
    marginLeft: 0,
  },
  fontBtn: {
    borderWidth: 2,
    borderRadius: 6,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 6,
    paddingBottom: 6,
  },
})
