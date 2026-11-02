import { memo, useRef, useState } from 'react'
import { View, TextInput, TouchableOpacity } from 'react-native'

import SubTitle from '../../components/SubTitle'
import CommonButton from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { TEST_SOURCES, testSource, type SourceTestId, type SourceTestResult } from '@/core/musicSourceTest'
import { getQualityLabel } from '@/config/quality'

const DEFAULT_KEYWORDS: Record<SourceTestId, string> = {
  kw: '晴天',
  kg: '晴天',
  tx: '晴天',
  wy: '再也没有',
  mg: '晴天',
}


/**
 * 音源测试（1.16.0，参照 LX-X）：按平台搜索一首歌，实测各档音质可用性，
 * 显示实际最高可用音质与 OK/FAIL 状态。
 */
export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const [keywords, setKeywords] = useState<Record<SourceTestId, string>>({ ...DEFAULT_KEYWORDS })
  const [results, setResults] = useState<Partial<Record<SourceTestId, SourceTestResult>>>({})
  const [testing, setTesting] = useState(false)
  const testingRef = useRef(false)

  const setResult = (result: SourceTestResult) => {
    setResults(prev => ({ ...prev, [result.source]: result }))
  }

  const handleTest = (id: SourceTestId) => {
    if (testingRef.current) return
    setResult({ source: id, status: 'testing' })
    void testSource(id, keywords[id] || DEFAULT_KEYWORDS[id]).then(setResult).catch(err => {
      setResult({ source: id, status: 'fail', message: (err as Error).message })
    })
  }

  const handleTestAll = () => {
    if (testingRef.current) return
    testingRef.current = true
    setTesting(true)
    void Promise.all(TEST_SOURCES.map(async({ id }) => {
      setResult({ source: id, status: 'testing' })
      const result = await testSource(id, keywords[id] || DEFAULT_KEYWORDS[id]).catch(err => ({
        source: id,
        status: 'fail' as const,
        message: (err as Error).message,
      }))
      setResult(result)
    })).finally(() => {
      testingRef.current = false
      setTesting(false)
    })
  }

  const statusText = (result?: SourceTestResult) => {
    if (!result || result.status == 'idle') return t('setting_source_test_idle')
    if (result.status == 'testing') return t('setting_source_test_testing')
    if (result.status == 'ok') return `[OK] ${getQualityLabel(result.quality)}`
    return `[FAIL] ${result.message ?? ''}`
  }

  return (
    <SubTitle title={t('setting_source_test')}>
      <View style={styles.content}>
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>{t('setting_source_test_tip')}</Text>
        {
          TEST_SOURCES.map(({ id, name }) => {
            const result = results[id]
            const ok = result?.status == 'ok'
            const fail = result?.status == 'fail'
            return (
              <View key={id} style={styles.row}>
                <Text size={13} style={styles.name}>{name}</Text>
                <TextInput
                  style={[styles.input, { borderColor: theme['c-border-background'], color: theme['c-600'] }]}
                  value={keywords[id]}
                  onChangeText={value => { setKeywords(prev => ({ ...prev, [id]: value })) }}
                  placeholder={DEFAULT_KEYWORDS[id]}
                  placeholderTextColor={theme['c-font-label']}
                />
                <CommonButton style={styles.testBtn} onPress={() => { handleTest(id) }} disabled={testing}>
                  <Text size={12} color={theme['c-button-font']}>{t('setting_source_test_btn')}</Text>
                </CommonButton>
                <Text size={12} style={styles.result} color={ok ? theme['c-primary-font'] : fail ? theme['c-font-label'] : theme['c-font-label']}>
                  {statusText(result)}
                </Text>
                {
                  ok && result?.song && (
                    <Text size={11} color={theme['c-font-label']} style={styles.song}>{result.song}</Text>
                  )
                }
              </View>
            )
          })
        }
        <View style={styles.btnRow}>
          <CommonButton style={styles.allBtn} onPress={handleTestAll} disabled={testing}>
            <Text size={13} color={theme['c-button-font']}>{testing ? t('setting_source_test_testing') : t('setting_source_test_all')}</Text>
          </CommonButton>
          <TouchableOpacity onPress={() => { setResults({}) }} style={styles.clearBtn}>
            <Text size={13} color={theme['c-font-label']}>{t('setting_source_test_clear')}</Text>
          </TouchableOpacity>
        </View>
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
  row: {
    marginTop: 10,
  },
  name: {
    fontWeight: '600',
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
  },
  testBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingLeft: 14,
    paddingRight: 14,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 4,
  },
  result: {
    marginTop: 4,
  },
  song: {
    marginTop: 2,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 14,
  },
  allBtn: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 6,
    borderRadius: 4,
  },
  clearBtn: {
    paddingVertical: 6,
  },
})
