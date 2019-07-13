import { IAM } from 'aws-sdk'
import { iam } from './iam'
import { ArnType, DocJson, listPolicyVersions, getPolicyVersion } from './operation';

export interface PolicyStatementNode {
  Sid: string
  Effect: string
  Action: any
  Resource: any
}

export type PolicyDocumentNode = {
  Version: string
  Statement: PolicyStatementNode[]
}

export type PolicyNode = {
  PolicyName: string
  Path?: string
}

export class PolicyEntry {
  arn: ArnType;
  policyNode: PolicyNode;
  document: PolicyDocumentNode;

  constructor(arn: ArnType, document: PolicyDocumentNode) {
    this.arn = arn;
    const arnParts = arn.split('/');
    this.policyNode = {
      PolicyName: arnParts[arnParts.length - 1],
      Path: arnParts.length === 3 ? arnParts[1] : undefined,
    };
    this.document = document;
  }

  get policyName(): string {
    return this.policyNode.PolicyName
  }
  
  documentAsJson(): DocJson {
    return this.convertDocToJSON(this.document, 4)
  }

  toCreatePolicyParams(indent: number): IAM.CreatePolicyRequest {
    return {
      PolicyName: this.policyNode.PolicyName,
      Path: this.policyNode.Path,
      PolicyDocument: this.convertDocToJSON(this.document, indent),
    }
  }
  
  private convertDocToJSON(doc: object, indent: number = 4): DocJson {
    return JSON.stringify(doc, null, indent)
  }
}

export type PolicyVersionsInfo = {
  defaultId: string
  oldestId: string
  count: number
}

export type GetPolicyDefaultWithVersionInfoResult = {
  currentPolicy: PolicyEntry
}

export class PolicyFetcher {
  private arnPrefix?: string

  constructor(arnPrefix?: string) {
    this.arnPrefix = arnPrefix
  }

  async getPolicyDefaultWithVersionInfo(name: string): Promise<GetPolicyDefaultWithVersionInfoResult & PolicyVersionsInfo> {
    const arn = `${this.arnPrefix!}/${name}`

    const versions = await listPolicyVersions(arn)
    if (versions.length === 0) {
      throw new Error('Failed to get policy versions')
    }

    const { defaultId, oldestId, count } = this.getPolicyVersionsInfoFrom(versions)

    return {
      defaultId,
      oldestId,
      count,
      currentPolicy: await this.getPolicyVersion(arn, defaultId)
    }
  }

  async getPolicyVersion(policyArn: string, verionId: string): Promise<PolicyEntry> {
    const result = await getPolicyVersion(policyArn, verionId)
    const docNode: PolicyDocumentNode = JSON.parse(decodeURIComponent(result.Document!))

    return new PolicyEntry(policyArn, docNode)
  }

  private getPolicyVersionsInfoFrom(versions: IAM.PolicyVersion[]): PolicyVersionsInfo {
    let defaultId: string = ''
    let oldestId: string = ''
    let createDate = new Date('2099-12-31T00:00:00.000Z')

    versions.forEach((ver: IAM.PolicyVersion) => {
      if (ver.IsDefaultVersion) {
        defaultId = ver.VersionId!
      } else {
        const date = ver.CreateDate!
        if (date < createDate) {
          createDate = date
          oldestId = ver.VersionId!
        }
      }
    })

    return {
      defaultId,
      oldestId,
      count: versions.length,
    }
  }
}

let _policyArnPrefix: string | null = null;

export async function getPolicyArnPrefix(): Promise<string> {
  if (_policyArnPrefix) {
  	return _policyArnPrefix!
  }

  const params = {
    Scope: 'Local',
    MaxItems: 1,
  }

  const data = await iam.listPolicies(params).promise()
  const policies = data.Policies!
  if (policies.length) {
    _policyArnPrefix = policies[0].Arn!.split('/')[0]
  }
  return _policyArnPrefix!
}
